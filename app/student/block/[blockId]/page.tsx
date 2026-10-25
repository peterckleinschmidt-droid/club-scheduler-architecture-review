import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { submitInterests } from './actions';
import { StudentClubFormClient } from './student-club-form-client';

export default async function StudentForm({
  params,
}: {
  params: Promise<{ blockId: string }>;
}) {
  const { blockId } = await params;
  const user = await requireRole(['student', 'admin']);
  const supabase = await createClient();

  const [
    { data: block },
    { data: student },
    { data: clubsData = [] },
    { data: teachersData = [] },
  ] = await Promise.all([
    supabase.from('blocks').select('*').eq('id', blockId).single(),

    supabase
      .from('students')
      .select('*, teachers(teacher_name)')
      .or(`linked_user_id.eq.${user.id},student_email.eq.${user.email}`)
      .maybeSingle(),

    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', blockId)
      .eq('is_active', true)
      .eq('show_to_students', true)
      .order('club_title'),

    supabase
      .from('teachers')
      .select('*')
      .eq('is_active', true)
      .order('teacher_name', { ascending: true }),
  ]);

  const clubRows = (clubsData ?? []) as any[];
  const teacherRows = (teachersData ?? []) as any[];

  if (!block?.student_form_open) {
    return (
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-2xl font-bold">Club sign-up is closed</h1>
        <p className="mt-2 text-sm text-slate-600">
          The student form is currently closed for this session.
        </p>
      </div>
    );
  }

  let latestSubmission: any = null;
  let ratingsByClubId = new Map<string, number>();

  if (student) {
    const { data: submission } = await supabase
      .from('student_submissions')
      .select('*')
      .eq('block_id', blockId)
      .eq('student_id', student.id)
      .eq('is_latest', true)
      .maybeSingle();

    latestSubmission = submission;

    if (submission) {
      const { data: ratingsData = [] } = await supabase
        .from('student_interest_ratings')
        .select('*')
        .eq('student_submission_id', submission.id);

      const ratingRows = (ratingsData ?? []) as any[];

      ratingsByClubId = new Map(
        ratingRows.map((rating: any) => [
          rating.club_offering_id,
          Number(rating.interest_score ?? 0),
        ])
      );
    }
  }

  const defaultTeacherSelection = student?.teacher_id
    ? String(student.teacher_id)
    : student
      ? '__other__'
      : '';

  const defaultTeacherOther = student?.teacher_id
    ? ''
    : student?.teacher_homeroom_text ?? '';

  const initialScores = Object.fromEntries(
    Array.from(ratingsByClubId.entries())
  );

  return (
    <StudentClubFormClient
      userEmail={user.email ?? ''}
      student={student}
      teachers={teacherRows}
      clubs={clubRows}
      latestSubmission={latestSubmission}
      defaultTeacherSelection={defaultTeacherSelection}
      defaultTeacherOther={defaultTeacherOther}
      initialScores={initialScores}
      action={submitInterests.bind(null, blockId)}
    />
  );
}