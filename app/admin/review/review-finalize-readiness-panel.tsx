import { getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type Concern = {
  label: string;
  detail: string;
  tone: 'red' | 'orange' | 'yellow';
  blocking?: boolean;
};

function ConcernBadge({ concern }: { concern: Concern }) {
  const className =
    concern.tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-900'
      : concern.tone === 'orange'
        ? 'border-orange-200 bg-orange-50 text-orange-900'
        : 'border-yellow-200 bg-yellow-50 text-yellow-900';

  return (
    <div className={`rounded-xl border p-3 text-sm ${className}`}>
      <div className="font-semibold">{concern.label}</div>
      <div className="mt-1">{concern.detail}</div>
    </div>
  );
}

function gotTopChoice({
  submission,
  assigned,
}: {
  submission: any;
  assigned: any[];
}) {
  if (!submission.top_choice_club_id) return false;

  return assigned.some(
    (assignment) => assignment.club_offering_id === submission.top_choice_club_id
  );
}

function buildFocusedStudentReviewRows({
  submissions,
  assignmentsByStudent,
  ratingByStudentClub,
  addressedStudentIds,
}: {
  submissions: any[];
  assignmentsByStudent: Map<string, any[]>;
  ratingByStudentClub: Map<string, number>;
  addressedStudentIds: Set<string>;
}) {
  return submissions
    .filter((submission) => safeNumber(submission.max_clubs) > 0)
    .map((submission) => {
      const assigned = assignmentsByStudent.get(submission.student_id) ?? [];
      const requested = safeNumber(submission.max_clubs);
      const assignedCount = assigned.length;
      const gotTop = gotTopChoice({ submission, assigned });

      const ratings = Array.isArray(submission.student_interest_ratings)
        ? submission.student_interest_ratings
        : [];

      const highInterestRequestedCount = ratings.filter(
        (rating: any) => safeNumber(rating.interest_score) >= 2
      ).length;

      const highInterestAssignedCount = assigned.filter((assignment: any) => {
        const score =
          ratingByStudentClub.get(
            `${submission.student_id}:${assignment.club_offering_id}`
          ) ?? 0;

        return score >= 2;
      }).length;

      const noClubAssigned = requested > 0 && assignedCount === 0;
      const noHighInterestClubAssigned =
        highInterestRequestedCount > 0 && highInterestAssignedCount === 0;

      return {
        submission,
        assigned,
        requested,
        assignedCount,
        gotTop,
        highInterestRequestedCount,
        highInterestAssignedCount,
        noClubAssigned,
        noHighInterestClubAssigned,
        needsReview: noClubAssigned || noHighInterestClubAssigned,
        isAddressed: addressedStudentIds.has(submission.student_id),
      };
    })
    .filter((row) => row.needsReview);
}

async function buildFinalizeConcerns() {
  const supabase = createAdminClient();
  const { block } = await getActiveContext();

  if (!block) {
    return {
      run: null,
      concerns: [
        {
          label: 'No current session',
          detail: 'Choose a current session before sending rosters to Google.',
          tone: 'red' as const,
          blocking: true,
        },
      ],
    };
  }

  const { data: run } = await supabase
    .from('match_runs')
    .select('*')
    .eq('block_id', block.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return {
      run: null,
      concerns: [
        {
          label: 'Matching has not been run',
          detail: 'Run matching before sending rosters to Google.',
          tone: 'red' as const,
          blocking: true,
        },
      ],
    };
  }

  const [
    { data: below = [] },
    { data: decisions = [] },
    { data: drafts = [] },
    { data: submissions = [] },
    { data: clubs = [] },
    { data: overrides = [] },
  ] = await Promise.all([
    supabase
      .from('match_demand_summaries')
      .select('*')
      .eq('match_run_id', run.id)
      .eq('below_minimum', true),

    supabase
      .from('below_minimum_decisions')
      .select('*')
      .eq('block_id', block.id),

    supabase.from('draft_assignments').select('*').eq('match_run_id', run.id),

    supabase
      .from('student_submissions')
      .select('*, student_interest_ratings(*)')
      .eq('block_id', block.id)
      .eq('is_latest', true),

    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', block.id)
      .eq('is_active', true)
      .eq('show_to_students', true),

    supabase
      .from('assignment_overrides')
      .select('*')
      .eq('block_id', block.id)
      .eq('match_run_id', run.id),
  ]);

  const decisionByClubId = new Map(
    (decisions as any[]).map((decision) => [
      decision.club_offering_id,
      decision,
    ])
  );

  const cancelledClubIds = new Set(
    (decisions as any[])
      .filter((decision) => decision.decision === 'cancel')
      .map((decision) => decision.club_offering_id)
  );

  const unresolvedBelow = (below as any[]).filter(
    (item) => !decisionByClubId.has(item.club_offering_id)
  );

  const effectiveDrafts = (drafts as any[]).filter(
    (draft) => !cancelledClubIds.has(draft.club_offering_id)
  );

  const cancelledDrafts = (drafts as any[]).filter((draft) =>
    cancelledClubIds.has(draft.club_offering_id)
  );

  const assignmentsByStudent = new Map<string, any[]>();
  const assignmentsByClub = new Map<string, any[]>();

  for (const draft of effectiveDrafts) {
    const studentRows = assignmentsByStudent.get(draft.student_id) ?? [];
    studentRows.push(draft);
    assignmentsByStudent.set(draft.student_id, studentRows);

    const clubRows = assignmentsByClub.get(draft.club_offering_id) ?? [];
    clubRows.push(draft);
    assignmentsByClub.set(draft.club_offering_id, clubRows);
  }

  const ratingByStudentClub = new Map<string, number>();

  for (const submission of submissions as any[]) {
    const ratings = Array.isArray(submission.student_interest_ratings)
      ? submission.student_interest_ratings
      : [];

    for (const rating of ratings) {
      ratingByStudentClub.set(
        `${submission.student_id}:${rating.club_offering_id}`,
        safeNumber(rating.interest_score)
      );
    }
  }

  const addressedStudentIds = new Set(
    (overrides as any[])
      .filter((override) => override.action_type === 'needs_attention_addressed')
      .map((override) => override.student_id)
  );

  const focusedReviewRows = buildFocusedStudentReviewRows({
    submissions: submissions as any[],
    assignmentsByStudent,
    ratingByStudentClub,
    addressedStudentIds,
  });

  const unaddressedFocusedReviewRows = focusedReviewRows.filter(
    (row) => !row.isAddressed
  );

  const zeroClubUnaddressed = unaddressedFocusedReviewRows.filter(
    (row) => row.noClubAssigned
  );

  const noHighInterestUnaddressed = unaddressedFocusedReviewRows.filter(
    (row) => row.noHighInterestClubAssigned && !row.noClubAssigned
  );

  const overCapacityClubs = (clubs as any[]).filter((club) => {
    if (club.capacity_type !== 'limited') return false;

    const maxCapacity = safeNumber(club.max_capacity);
    if (maxCapacity <= 0) return false;

    const assignedCount = assignmentsByClub.get(club.id)?.length ?? 0;
    return assignedCount > maxCapacity;
  });

  const concerns: Concern[] = [];

  if (unresolvedBelow.length > 0) {
    concerns.push({
      label: 'Small clubs need a decision',
      detail: `${unresolvedBelow.length} club${
        unresolvedBelow.length === 1 ? '' : 's'
      } need${
        unresolvedBelow.length === 1 ? 's' : ''
      } a keep-or-cancel decision before rosters can be sent to Google.`,
      tone: 'red',
      blocking: true,
    });
  }

  if (unaddressedFocusedReviewRows.length > 0) {
    concerns.push({
      label: 'Students need help',
      detail: `${unaddressedFocusedReviewRows.length} student${
        unaddressedFocusedReviewRows.length === 1 ? '' : 's'
      } may need a quick look: ${zeroClubUnaddressed.length} with no club assigned and ${
        noHighInterestUnaddressed.length
      } without a high-interest club.`,
      tone: 'orange',
    });
  }

  if (overCapacityClubs.length > 0) {
    concerns.push({
      label: 'Clubs are over capacity',
      detail: `${overCapacityClubs.length} club${
        overCapacityClubs.length === 1 ? '' : 's'
      } are over capacity after manual changes.`,
      tone: 'yellow',
    });
  }

  if (cancelledDrafts.length > 0) {
    concerns.push({
      label: 'Canceled club assignments',
      detail: `${cancelledDrafts.length} draft assignment${
        cancelledDrafts.length === 1 ? '' : 's'
      } are attached to canceled clubs. They will not be included in final rosters.`,
      tone: 'yellow',
    });
  }

  return { run, concerns };
}

export async function FinalizeReadinessPanel({ transferControl }: { transferControl?: ReactNode }) {
  const { run, concerns } = await buildFinalizeConcerns();

  const blockingConcerns = concerns.filter((concern) => concern.blocking);
  const nonBlockingConcerns = concerns.filter((concern) => !concern.blocking);
  const hasConcerns = concerns.length > 0;
  const hasBlockingConcerns = blockingConcerns.length > 0;

  if (!run) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-950">
        <h2 className="text-lg font-semibold">Ready to send draft rosters to Google?</h2>
        <p className="mt-1 text-sm">
          Rosters cannot move to Google review until matching has been run.
        </p>

        <div className="mt-3 space-y-2">
          {concerns.map((concern) => (
            <ConcernBadge key={concern.label} concern={concern} />
          ))}
        </div>
      </section>
    );
  }

  if (!hasConcerns) {
    return (
      <section className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Ready to send draft rosters to Google?</h2>
            <p className="mt-1 text-sm">
              No required Scheduler checks remain. Send the draft rosters to Google when you are ready.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            Send the draft from this page. Scheduler will confirm that the Google review workbook is ready.
        {transferControl ? (
          <div className="mt-4">{transferControl}</div>
        ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold">Ready to send draft rosters to Google?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Check these items before sending rosters to Google. Small-club decisions and canceled-club cleanup must be finished first.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        {concerns.map((concern) => (
          <ConcernBadge key={concern.label} concern={concern} />
        ))}
      </div>

      {hasBlockingConcerns ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          The rosters cannot be sent yet. Finish the required item above, then use the button on this page. You do not need to
          return to Workflow to send draft rosters.
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-semibold">Ready for review in Google</div>
            <div className="mt-1">
              {nonBlockingConcerns.length} non-blocking item
              {nonBlockingConcerns.length === 1 ? '' : 's'} will remain visible during Google roster review.
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
            These items do not block the handoff. Send the draft rosters when you are comfortable with the review.
          {transferControl ? (
          <div className="mt-4">{transferControl}</div>
        ) : null}
          </div>
        </div>
      )}
    </section>
  );
}