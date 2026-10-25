"use server";

import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMatching } from '@/lib/matching/engine';
import { revalidatePath } from 'next/cache';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function isValidDecision(value: string) {
  return value === 'force_run' || value === 'cancel';
}

async function mustSucceed(resultPromise: PromiseLike<any>, message: string) {
  const result = await resultPromise;

  if (result.error) {
    const details = [
      result.error.message,
      result.error.details,
      result.error.hint,
      result.error.code,
    ]
      .filter(Boolean)
      .join(' | ');

    throw new Error(`${message}: ${details || 'Unknown error'}`);
  }

  return result;
}

async function getLatestCompletedRunForActiveBlock() {
  const { block } = await getActiveContext();

  if (!block) {
    throw new Error('No current club session found.');
  }

  const supabase = createAdminClient();

  const { data: run, error: runError } = await supabase
    .from('match_runs')
    .select('*')
    .eq('block_id', block.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (runError || !run) {
    throw new Error(
      `Could not load latest completed match run: ${
        runError?.message ?? 'Not found'
      }`
    );
  }

  return { block, run, supabase };
}

export async function decide(formData: FormData) {
  const user = await requireRole(['admin']);
  const { block } = await getActiveContext();

  if (!block) {
    throw new Error('No current club session found.');
  }

  const supabase = createAdminClient();

  const clubOfferingId = clean(formData.get('club_offering_id'));
  const decision = clean(formData.get('decision'));
  const notes = clean(formData.get('notes'));

  if (!clubOfferingId) {
    throw new Error('Missing club ID.');
  }

  if (!isValidDecision(decision)) {
    throw new Error('Invalid decision.');
  }

  await mustSucceed(
    supabase.from('below_minimum_decisions').upsert(
      {
        block_id: block.id,
        club_offering_id: clubOfferingId,
        decision,
        decided_by_user_id: user.id,
        notes,
        decided_at: new Date().toISOString(),
      },
      {
        onConflict: 'block_id,club_offering_id',
      }
    ),
    'Could not save small-club decision'
  );

  revalidateReviewPaths();
}

export async function undoCancel(formData: FormData) {
  await requireRole(['admin']);
  const { block } = await getActiveContext();

  if (!block) {
    throw new Error('No current club session found.');
  }

  const supabase = createAdminClient();

  const clubOfferingId = clean(formData.get('club_offering_id'));

  if (!clubOfferingId) {
    throw new Error('Missing club ID.');
  }

  await mustSucceed(
    supabase
      .from('below_minimum_decisions')
      .delete()
      .eq('block_id', block.id)
      .eq('club_offering_id', clubOfferingId)
      .eq('decision', 'cancel'),
    'Could not undo cancellation'
  );

  revalidateReviewPaths();
}

export async function rematch() {
  await requireRole(['admin']);
  const { block } = await getActiveContext();

  if (!block) {
    throw new Error('No current club session found.');
  }

  await runMatching(block.id, 'rematch');

  revalidateReviewPaths();
}

export async function removeDraftAssignment(formData: FormData) {
  const user = await requireRole(['admin']);
  const assignmentId = clean(formData.get('assignment_id'));
  const reason = clean(formData.get('reason'));
  const overrideReason = reason || 'Removed by coordinator.';

  if (!assignmentId) {
    throw new Error('Missing roster spot ID.');
  }

  const { block, run, supabase } = await getLatestCompletedRunForActiveBlock();

  const { data: assignment, error: assignmentError } = await supabase
    .from('draft_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('match_run_id', run.id)
    .single();

  if (assignmentError || !assignment) {
    throw new Error(
      `Could not load roster spot: ${
        assignmentError?.message ?? 'Not found'
      }`
    );
  }

  await mustSucceed(
    supabase.from('assignment_overrides').insert({
      block_id: block.id,
      match_run_id: run.id,
      draft_assignment_id: assignment.id,
      student_id: assignment.student_id,
      club_offering_id: assignment.club_offering_id,
      action_type: 'manual_remove',
      reason: overrideReason,
      created_by_user_id: user.id,
      created_at: new Date().toISOString(),
    }),
    'Could not save roster change note'
  );

  await mustSucceed(
    supabase
      .from('draft_assignments')
      .delete()
      .eq('id', assignment.id)
      .eq('match_run_id', run.id),
    'Could not remove roster spot'
  );

  revalidateReviewPaths();
}

export async function addDraftAssignment(formData: FormData) {
  const user = await requireRole(['admin']);
  const studentId = clean(formData.get('student_id'));
  const clubOfferingId = clean(formData.get('club_offering_id'));
  const reason = clean(formData.get('reason'));
  const overrideReason = reason || 'Added by coordinator.';

  if (!studentId) {
    throw new Error('Missing student ID.');
  }

  if (!clubOfferingId) {
    throw new Error('Missing club ID.');
  }

  const { block, run, supabase } = await getLatestCompletedRunForActiveBlock();

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, student_name, grade, school_year_id')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError || !student) {
    throw new Error(
      `Could not load student: ${studentError?.message ?? 'Not found'}`
    );
  }

  const { data: club, error: clubError } = await supabase
    .from('club_offerings')
    .select('id, club_title, block_id, grade_limited, eligible_grades, eligible_grade, meeting_days')
    .eq('id', clubOfferingId)
    .eq('block_id', block.id)
    .maybeSingle();

  if (clubError || !club) {
    throw new Error(
      `Could not load club for current session: ${
        clubError?.message ?? 'Not found'
      }`
    );
  }
  const eligibleGrades = Array.isArray(club.eligible_grades)
    ? club.eligible_grades.map(Number)
    : club.eligible_grade
      ? [Number(club.eligible_grade)]
      : [];
  if (club.grade_limited && !eligibleGrades.includes(Number(student.grade))) {
    throw new Error(
      `This student is in Grade ${student.grade ?? 'unknown'}, but ${club.club_title} is available only to Grade ${eligibleGrades.join(' or ')}.`
    );
  }
  const { data: currentAssignments, error: currentAssignmentsError } = await supabase
    .from('draft_assignments')
    .select('club_offerings(club_title, meeting_days)')
    .eq('match_run_id', run.id)
    .eq('student_id', studentId);
  if (currentAssignmentsError) {
    throw new Error(`Could not check meeting-day conflicts: ${currentAssignmentsError.message}`);
  }
  const newClubDays = Array.isArray(club.meeting_days) ? club.meeting_days : [];
  const conflictingClub = (currentAssignments ?? []).find((assignment: any) => {
    const assignedDays = Array.isArray(assignment.club_offerings?.meeting_days)
      ? assignment.club_offerings.meeting_days
      : [];
    return newClubDays.some((day: string) => assignedDays.includes(day));
  });
  if (conflictingClub) {
    throw new Error(
      `This student is already assigned to ${((conflictingClub as any).club_offerings?.club_title ?? (conflictingClub as any).club_offerings?.[0]?.club_title ?? 'another club')} on the same meeting day.`
    );
  }

  const { data: existingAssignment, error: existingError } = await supabase
    .from('draft_assignments')
    .select('id')
    .eq('match_run_id', run.id)
    .eq('student_id', studentId)
    .eq('club_offering_id', clubOfferingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Could not check existing roster spot: ${existingError.message}`
    );
  }

  if (existingAssignment) {
    throw new Error('This student is already on this club roster.');
  }

  const now = new Date().toISOString();

  const { data: insertedAssignment, error: insertError } = await supabase
    .from('draft_assignments')
    .insert({
      match_run_id: run.id,
      student_id: studentId,
      club_offering_id: clubOfferingId,
      assignment_pass: 99,
      was_top_choice: false,
      fairness_boost: 0,
      priority_score: 0,
      manually_added: true,
      override_reason: overrideReason,
      overridden_by_user_id: user.id,
      overridden_at: now,
    })
    .select()
    .single();

  if (insertError || !insertedAssignment) {
    throw new Error(
      `Could not add student to roster: ${insertError?.message ?? 'Unknown error'}`
    );
  }

  await mustSucceed(
    supabase.from('assignment_overrides').insert({
      block_id: block.id,
      match_run_id: run.id,
      draft_assignment_id: insertedAssignment.id,
      student_id: studentId,
      club_offering_id: clubOfferingId,
      action_type: 'manual_add',
      reason: overrideReason,
      created_by_user_id: user.id,
      created_at: now,
    }),
    'Could not save roster change note'
  );

  revalidateReviewPaths();
}

export async function markStudentNeedsAttentionAddressed(formData: FormData) {
  const user = await requireRole(['admin']);
  const studentId = clean(formData.get('student_id'));
  const reason = clean(formData.get('reason'));
  const addressedReason =
    reason || 'Reviewed by coordinator; no roster change needed.';

  if (!studentId) {
    throw new Error('Missing student ID.');
  }

  const { block, run, supabase } = await getLatestCompletedRunForActiveBlock();

  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError || !student) {
    throw new Error(
      `Could not load student: ${studentError?.message ?? 'Not found'}`
    );
  }

  await mustSucceed(
    supabase.from('assignment_overrides').insert({
      block_id: block.id,
      match_run_id: run.id,
      student_id: studentId,
      club_offering_id: null,
      draft_assignment_id: null,
      action_type: 'needs_attention_addressed',
      reason: addressedReason,
      created_by_user_id: user.id,
      created_at: new Date().toISOString(),
    }),
    'Could not save review note'
  );

  revalidateReviewPaths();
}

export async function markUnderassignedStudentAddressed(formData: FormData) {
  return markStudentNeedsAttentionAddressed(formData);
}

export async function finalize() {
  await requireRole(['admin']);
  const { block } = await getActiveContext();
  if (!block) {
    throw new Error('No current club session found.');
  }

  throw new Error(
    'Use Workflow to send draft rosters to Google, review named rosters there, then pull reviewed rosters from Google to finalize this session.'
  );
}
async function createOrRefreshHistorySnapshot({
  supabase,
  block,
  userId,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  block: any;
  userId: string;
}) {
  const { data: existingSnapshot, error: existingSnapshotError } = await supabase
    .from('history_snapshots')
    .select('*')
    .eq('block_id', block.id)
    .maybeSingle();

  if (existingSnapshotError) {
    throw new Error(
      `Could not load saved results: ${existingSnapshotError.message}`
    );
  }

  let snapshotId = existingSnapshot?.id as string | undefined;

  if (snapshotId) {
    await mustSucceed(
      supabase
        .from('history_student_outcomes')
        .delete()
        .eq('history_snapshot_id', snapshotId),
      'Could not clear prior saved student results'
    );

    await mustSucceed(
      supabase
        .from('history_snapshots')
        .update({
          committed_by_user_id: userId,
          committed_at: new Date().toISOString(),
        })
        .eq('id', snapshotId),
      'Could not refresh saved results'
    );
  } else {
    const { data: newSnapshot, error: snapshotError } = await supabase
      .from('history_snapshots')
      .insert({
        block_id: block.id,
        school_year_id: block.school_year_id,
        committed_by_user_id: userId,
        committed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (snapshotError || !newSnapshot) {
      throw new Error(
        `Could not save results: ${snapshotError?.message ?? 'Unknown error'}`
      );
    }

    snapshotId = newSnapshot.id;
  }

  const [
    { data: submissions = [], error: submissionsError },
    { data: finals = [], error: finalsError },
  ] = await Promise.all([
    supabase
      .from('student_submissions')
      .select('*')
      .eq('block_id', block.id)
      .eq('is_latest', true),

    supabase.from('final_assignments').select('*').eq('block_id', block.id),
  ]);

  if (submissionsError) {
    throw new Error(`Could not load student choices: ${submissionsError.message}`);
  }

  if (finalsError) {
    throw new Error(`Could not load final rosters: ${finalsError.message}`);
  }

  const finalsByStudent = new Map<string, any[]>();

  for (const finalAssignment of finals as any[]) {
    const existing = finalsByStudent.get(finalAssignment.student_id) ?? [];
    existing.push(finalAssignment);
    finalsByStudent.set(finalAssignment.student_id, existing);
  }

  const outcomeRows = (submissions as any[]).map((submission) => {
    const assigned = finalsByStudent.get(submission.student_id) ?? [];
    const clubsReceived = assigned.length;
    const requested = Number(submission.max_clubs ?? 0);
    const unmetDemand = Math.max(0, requested - clubsReceived);

    const gotTopChoice = Boolean(
      submission.top_choice_club_id &&
        assigned.some(
          (assignment) =>
            assignment.club_offering_id === submission.top_choice_club_id
        )
    );

    return {
      history_snapshot_id: snapshotId,
      student_id: submission.student_id,
      clubs_received: clubsReceived,
      got_top_choice: gotTopChoice,
      unmet_demand: unmetDemand,
      zero_club_flag: requested > 0 && clubsReceived === 0,
    };
  });

  if (outcomeRows.length > 0) {
    await mustSucceed(
      supabase.from('history_student_outcomes').insert(outcomeRows),
      'Could not save student results'
    );
  }
}

function revalidateReviewPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/review');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/matching');
  revalidatePath('/admin/rosters');
  revalidatePath('/admin/archive');
}
