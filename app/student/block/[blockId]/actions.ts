'use server';

import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function parseMaxClubs(value: string) {
  const n = Number(value);

  if (![0, 1, 2, 3].includes(n)) {
    throw new Error('Please choose whether you would like 0, 1, 2, or 3 clubs.');
  }

  return n;
}

function participationPreferenceFromMaxClubs(maxClubs: number) {
  if (maxClubs === 0) return 'none';
  if (maxClubs === 1) return 'one';
  if (maxClubs === 2) return 'two';
  if (maxClubs === 3) return 'three';
  return 'none';
}

function parseInterestScore(value: FormDataEntryValue | null) {
  const raw = clean(value);

  if (raw === '') {
    return null;
  }

  const score = Number(raw);

  if (![0, 1, 2].includes(score)) {
    throw new Error('Invalid club interest rating.');
  }

  return score;
}

function interestLabelFromScore(score: number) {
  /**
   * Keep legacy database labels for compatibility with existing reports/data:
   * 0 = Do not place me here
   * 1 = I would try this
   * 2 = I really want this
   */
  if (score === 0) return 'not_interested';
  if (score === 1) return 'a_little_interested';
  if (score === 2) return 'very_interested';

  return 'not_interested';
}

export async function submitInterests(blockId: string, formData: FormData) {
  const user = await requireRole(['student', 'admin']);
  const supabase = createAdminClient();

  if (!user.email) {
    throw new Error('Authenticated email is missing.');
  }

  const { data: block, error: blockError } = await supabase
    .from('blocks')
    .select('id, school_year_id, student_form_open')
    .eq('id', blockId)
    .single();

  if (blockError || !block) {
    throw new Error(
      `Could not load session: ${blockError?.message ?? 'Session not found.'}`
    );
  }

  if (!block.student_form_open) {
    throw new Error('The student form is currently closed.');
  }

  const { data: clubs = [], error: clubsError } = await supabase
    .from('club_offerings')
    .select('id, club_title, section_label')
    .eq('block_id', blockId)
    .eq('is_active', true)
    .eq('show_to_students', true);

  if (clubsError) {
    throw new Error(`Could not load club choices: ${clubsError.message}`);
  }

  const student_name = clean(formData.get('student_name'));
  const grade = Number(formData.get('grade'));
  const teacher_selection = clean(formData.get('teacher_selection'));
  const teacher_other = clean(formData.get('teacher_other'));
  const max_clubs = parseMaxClubs(clean(formData.get('max_clubs')));
  const wantsNoClubs = max_clubs === 0;
  const participation_preference =
    participationPreferenceFromMaxClubs(max_clubs);
  const submittedTopChoice = clean(formData.get('top_choice_club_id'));

  if (!student_name) {
    throw new Error('Student name is required.');
  }

  if (![3, 4, 5].includes(grade)) {
    throw new Error('Grade must be 3, 4, or 5.');
  }

  if (!teacher_selection) {
    throw new Error('Please choose your teacher / homeroom.');
  }

  let teacher_id: string | null = null;
  let teacher_homeroom_text = '';

  if (teacher_selection === '__other__') {
    if (!teacher_other) {
      throw new Error(
        'Please enter your teacher / homeroom if it is not listed.'
      );
    }

    teacher_homeroom_text = teacher_other;
  } else {
    teacher_id = teacher_selection;

    const { data: teacher, error: teacherError } = await supabase
      .from('teachers')
      .select('id, teacher_name')
      .eq('id', teacher_selection)
      .single();

    if (teacherError || !teacher) {
      throw new Error(
        `Could not load teacher / homeroom: ${
          teacherError?.message ?? 'Not found'
        }`
      );
    }

    teacher_homeroom_text = teacher.teacher_name;
  }

  const availableClubIds = new Set((clubs as any[]).map((club) => club.id));
  const ratings: any[] = [];
  const scoreByClubId = new Map<string, number>();

  if (wantsNoClubs) {
    /**
     * Explicit opt-out:
     * Save all visible clubs as score 0 so the submitted data clearly records
     * that the student did not want placement in any available club.
     */
    for (const club of clubs as any[]) {
      scoreByClubId.set(club.id, 0);

      ratings.push({
        club_offering_id: club.id,
        interest_level: interestLabelFromScore(0),
        interest_score: 0,
      });
    }
  } else {
    if ((clubs as any[]).length === 0) {
      throw new Error('There are no club choices available right now.');
    }

    if (!submittedTopChoice) {
      throw new Error('Please choose your #1 club choice.');
    }

    if (!availableClubIds.has(submittedTopChoice)) {
      throw new Error('Your #1 choice is not one of the available clubs.');
    }

    for (const club of clubs as any[]) {
      const score = parseInterestScore(formData.get(`interest_${club.id}`));

      if (score === null) {
        throw new Error(
          `Please choose an answer for ${club.club_title ?? 'each club'}.`
        );
      }

      scoreByClubId.set(club.id, score);

      ratings.push({
        club_offering_id: club.id,
        interest_level: interestLabelFromScore(score),
        interest_score: score,
      });
    }

    const positiveInterestCount = Array.from(scoreByClubId.values()).filter(
      (score) => score > 0
    ).length;

    if (positiveInterestCount === 0) {
      throw new Error(
        'Please choose at least one club you would try or really want, or choose 0 clubs.'
      );
    }

    const topChoiceScore = scoreByClubId.get(submittedTopChoice);

    if (topChoiceScore === undefined) {
      throw new Error('Your #1 choice is missing an interest rating.');
    }

    if (topChoiceScore <= 0) {
      throw new Error(
        'Your #1 choice must be a club you would try or really want.'
      );
    }
  }

  const top_choice_club_id = wantsNoClubs ? null : submittedTopChoice;
  const normalizedEmail = user.email.toLowerCase();

  const { data: existingStudent, error: existingStudentError } = await supabase
    .from('students')
    .select('*')
    .eq('school_year_id', block.school_year_id)
    .or(`linked_user_id.eq.${user.id},student_email.eq.${normalizedEmail}`)
    .maybeSingle();

  if (existingStudentError) {
    throw new Error(
      `Could not load student profile: ${existingStudentError.message}`
    );
  }

  const studentPayload = {
    school_year_id: block.school_year_id,
    student_email: normalizedEmail,
    student_name,
    grade,
    teacher_id,
    teacher_homeroom_text,
    is_active: true,
    linked_user_id: user.id,
  };

  let studentId: string;

  if (existingStudent) {
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update(studentPayload)
      .eq('id', existingStudent.id)
      .select()
      .single();

    if (updateError || !updatedStudent) {
      throw new Error(
        `Could not update student profile: ${
          updateError?.message ?? 'Unknown error'
        }`
      );
    }

    studentId = updatedStudent.id;
  } else {
    const { data: createdStudent, error: createError } = await supabase
      .from('students')
      .insert(studentPayload)
      .select()
      .single();

    if (createError || !createdStudent) {
      throw new Error(
        `Could not create student profile: ${
          createError?.message ?? 'Unknown error'
        }`
      );
    }

    studentId = createdStudent.id;
  }

  await supabase
    .from('student_submissions')
    .update({ is_latest: false })
    .eq('block_id', blockId)
    .eq('student_id', studentId);

  const { data: submission, error: submissionError } = await supabase
    .from('student_submissions')
    .insert({
      block_id: blockId,
      student_id: studentId,
      submitted_by_user_id: user.id,
      participation_preference,
      max_clubs,
      top_choice_club_id,
      is_latest: true,
    })
    .select()
    .single();

  if (submissionError || !submission) {
    throw new Error(
      `Could not save student submission: ${
        submissionError?.message ?? 'Unknown error'
      }`
    );
  }

  const ratingRows = ratings.map((rating) => ({
    student_submission_id: submission.id,
    club_offering_id: rating.club_offering_id,
    interest_level: rating.interest_level,
    interest_score: rating.interest_score,
  }));

  if (ratingRows.length > 0) {
    const { error: ratingsError } = await supabase
      .from('student_interest_ratings')
      .insert(ratingRows);

    if (ratingsError) {
      throw new Error(
        `Could not save interest ratings: ${ratingsError.message}`
      );
    }
  }

  revalidatePath(`/student/${blockId}`);
  revalidatePath(`/student/${blockId}/submitted`);
  revalidatePath(`/student/block/${blockId}`);
  revalidatePath(`/student/block/${blockId}/submitted`);
  revalidatePath('/admin/students-roster');
  revalidatePath('/admin/student-submissions');
  revalidatePath('/admin/review');
  revalidatePath('/admin/matching');

  redirect(`/student/block/${blockId}/submitted`);
}