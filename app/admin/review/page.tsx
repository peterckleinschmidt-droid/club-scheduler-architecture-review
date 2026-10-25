import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { decide, rematch, undoCancel } from './actions';
import { ReviewRosterClient } from './review-roster-client';
import { ReviewAssignmentPreviewClient } from './review-assignment-preview-client';
import { ReviewNeedsAttentionClient } from './review-needs-attention-client';
import { Button } from '@/components/ui/button';
import { FinalizeReadinessPanel } from './review-finalize-readiness-panel';
import PushDraftAssignmentsClient from '../google-workspace/push-draft-assignments-client';

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function clubDisplayName(club: any) {
  if (!club) return 'Unknown club';

  return (
    [club.club_title, club.section_label].filter(Boolean).join(' — ') ||
    'Unknown club'
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

function focusedNeedsAttentionReason({
  requested,
  assignedCount,
  highInterestRequestedCount,
  highInterestAssignedCount,
}: {
  requested: number;
  assignedCount: number;
  highInterestRequestedCount: number;
  highInterestAssignedCount: number;
}) {
  if (requested > 0 && assignedCount === 0) {
    return {
      reason: 'No club assigned',
      detail: 'This student asked for a club but did not receive one.',
      priority: 2,
    };
  }

  if (highInterestRequestedCount > 0 && highInterestAssignedCount === 0) {
    return {
      reason: 'No high-interest club assigned',
      detail:
        'This student marked at least one club as high interest but did not receive a high-interest club.',
      priority: 1,
    };
  }

  return null;
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'slate' | 'purple';
}) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
        : tone === 'red'
          ? 'border-red-200 bg-red-50 text-red-900'
          : tone === 'orange'
            ? 'border-orange-200 bg-orange-50 text-orange-900'
            : tone === 'blue'
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : tone === 'purple'
                ? 'border-purple-200 bg-purple-50 text-purple-900'
                : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`rounded-2xl border p-4 ${className}`}>
      <div className="text-sm font-medium opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {detail ? <div className="mt-1 text-sm opacity-80">{detail}</div> : null}
    </div>
  );
}

function overrideActionLabel(actionType: string | null | undefined) {
  if (actionType === 'manual_add') return 'Added by coordinator';
  if (actionType === 'manual_remove') return 'Removed by coordinator';
  if (actionType === 'manual_move') return 'Moved by coordinator';
  if (actionType === 'needs_attention_addressed') return 'Marked reviewed';

  return 'Roster change';
}

function overrideTone(actionType: string | null | undefined) {
  if (actionType === 'manual_add') {
    return 'border-blue-200 bg-blue-50 text-blue-900';
  }

  if (actionType === 'manual_remove') {
    return 'border-orange-200 bg-orange-50 text-orange-900';
  }

  if (actionType === 'manual_move') {
    return 'border-purple-200 bg-purple-50 text-purple-900';
  }

  if (actionType === 'needs_attention_addressed') {
    return 'border-green-200 bg-green-50 text-green-900';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function ManualOverrideLog({ overrides }: { overrides: any[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Recent roster changes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Recent changes made by a coordinator.
        </p>
      </div>

      {overrides.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
          No coordinator changes have been logged for this draft roster.
        </div>
      ) : (
        <div className="rounded-2xl border bg-white">
          <div className="border-b px-4 py-3 text-sm text-slate-600">
            Showing the most recent{' '}
            <span className="font-medium text-slate-900">
              {overrides.length}
            </span>{' '}
            change{overrides.length === 1 ? '' : 's'}
          </div>

          <div className="divide-y">
            {overrides.map((override) => (
              <div key={override.id} className="p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-medium ${overrideTone(
                        override.action_type
                      )}`}
                    >
                      {overrideActionLabel(override.action_type)}
                    </span>

                    <span className="text-sm text-slate-500">
                      {formatDateTime(override.created_at)}
                    </span>
                  </div>

                  <div className="font-medium text-slate-900">
                    {override.students?.student_name ?? 'Unknown student'}
                    {override.club_offerings ? (
                      <> → {clubDisplayName(override.club_offerings)}</>
                    ) : null}
                  </div>

                  <div className="text-sm text-slate-600">
                    Grade {override.students?.grade ?? '—'} ·{' '}
                    {override.students?.teacher_homeroom_text ?? 'No homeroom'}
                    {override.students?.student_email
                      ? ` · ${override.students.student_email}`
                      : ''}
                  </div>

                  {override.reason ? (
                    <div className="mt-2 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="font-medium">Note:</span>{' '}
                      {override.reason}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <details className="border-t px-4 py-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              About this history
            </summary>
            <p className="mt-2">
              These changes are saved with the draft roster so coordinators can
              see what was adjusted before rosters are sent to Google.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}

export default async function Review() {
  await requireRole(['admin']);

  const s = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Review draft rosters before Google</h1>

        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No active school year or current session is configured.
        </div>
      </div>
    );
  }

  const { data: run } = await s
    .from('match_runs')
    .select('*')
    .eq('block_id', block.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    { data: below = [] },
    { data: decisions = [] },
    { data: assign = [] },
    { data: clubs = [] },
    { data: submissions = [] },
    { data: overrides = [] },
  ] = run
    ? await Promise.all([
        s
          .from('match_demand_summaries')
          .select('*, club_offerings(*)')
          .eq('match_run_id', run.id)
          .eq('below_minimum', true),

        s.from('below_minimum_decisions').select('*').eq('block_id', block.id),

        s
          .from('draft_assignments')
          .select(
            '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(*)'
          )
          .eq('match_run_id', run.id),

        s
          .from('club_offerings')
          .select('*')
          .eq('block_id', block.id)
          .eq('is_active', true)
          .eq('show_to_students', true)
          .order('club_title', { ascending: true }),

        s
          .from('student_submissions')
          .select(
            '*, students(student_name, student_email, grade, teacher_homeroom_text), student_interest_ratings(*)'
          )
          .eq('block_id', block.id)
          .eq('is_latest', true),

        s
          .from('assignment_overrides')
          .select(
            '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(club_title, section_label)'
          )
          .eq('block_id', block.id)
          .eq('match_run_id', run.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
    : [
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

  const decisionsByClubId = new Map(
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

  const forceRunClubIds = new Set(
    (decisions as any[])
      .filter((decision) => decision.decision === 'force_run')
      .map((decision) => decision.club_offering_id)
  );

  const effectiveAssignments = (assign as any[]).filter(
    (assignment) => !cancelledClubIds.has(assignment.club_offering_id)
  );

  const assignmentsByClubId = new Map<string, any[]>();
  const assignmentsByStudentId = new Map<string, any[]>();

  for (const assignment of effectiveAssignments) {
    const clubAssignments =
      assignmentsByClubId.get(assignment.club_offering_id) ?? [];
    clubAssignments.push(assignment);
    assignmentsByClubId.set(assignment.club_offering_id, clubAssignments);

    const studentAssignments =
      assignmentsByStudentId.get(assignment.student_id) ?? [];
    studentAssignments.push(assignment);
    assignmentsByStudentId.set(assignment.student_id, studentAssignments);
  }

  const clubById = new Map<string, any>();

  for (const club of clubs as any[]) {
    clubById.set(club.id, club);
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

  const belowRows = below as any[];

  const requestingSubmissions = (submissions as any[]).filter(
    (submission) => safeNumber(submission.max_clubs) > 0
  );

  const focusedNeedsAttentionRows = requestingSubmissions
    .map((submission) => {
      const assigned = assignmentsByStudentId.get(submission.student_id) ?? [];
      const requested = safeNumber(submission.max_clubs);
      const assignedCount = assigned.length;
      const unmet = Math.max(0, requested - assignedCount);
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

      const attention = focusedNeedsAttentionReason({
        requested,
        assignedCount,
        highInterestRequestedCount,
        highInterestAssignedCount,
      });

      return {
        submission,
        assigned,
        requested,
        assignedCount,
        unmet,
        gotTop,
        highInterestRequestedCount,
        highInterestAssignedCount,
        gotHighInterestClub: highInterestAssignedCount > 0,
        attention,
      };
    })
    .filter((row) => row.attention !== null)
    .sort((a, b) => {
      const aAddressed = addressedStudentIds.has(a.submission.student_id);
      const bAddressed = addressedStudentIds.has(b.submission.student_id);

      if (aAddressed !== bAddressed) return aAddressed ? 1 : -1;

      const aPriority = a.attention?.priority ?? 0;
      const bPriority = b.attention?.priority ?? 0;

      if (aPriority !== bPriority) return bPriority - aPriority;
      if (a.unmet !== b.unmet) return b.unmet - a.unmet;

      return String(a.submission.students?.student_name ?? '').localeCompare(
        String(b.submission.students?.student_name ?? '')
      );
    });

  const zeroClubStudents = focusedNeedsAttentionRows.filter(
    (row) => row.assignedCount === 0
  );

  const noHighInterestClubStudents = focusedNeedsAttentionRows.filter(
    (row) => row.attention?.reason === 'No high-interest club assigned'
  );

  const needsAttentionRows = focusedNeedsAttentionRows.map((row) => {
    const submission = row.submission;

    const ratings = Array.isArray(submission.student_interest_ratings)
      ? submission.student_interest_ratings
      : [];

    const currentClubs = row.assigned.map((assignment: any) => {
      const club = assignment.club_offerings;

      return {
        club_offering_id: assignment.club_offering_id,
        club_title: club?.club_title ?? null,
        section_label: club?.section_label ?? null,
        meeting_days: Array.isArray(club?.meeting_days)
          ? club.meeting_days
          : [],
      };
    });

    const interestedClubs = ratings
      .filter((rating: any) => safeNumber(rating.interest_score) > 0)
      .map((rating: any) => {
        const club = clubById.get(rating.club_offering_id);
        const assignedToClub =
          assignmentsByClubId.get(rating.club_offering_id) ?? [];

        const isAlreadyAssigned = row.assigned.some(
          (assignment: any) =>
            assignment.club_offering_id === rating.club_offering_id
        );

        return {
          club_offering_id: rating.club_offering_id,
          club_title: club?.club_title ?? null,
          section_label: club?.section_label ?? null,
          sponsor_name: club?.sponsor_name ?? null,
          meeting_days: Array.isArray(club?.meeting_days)
            ? club.meeting_days
            : [],
          capacity_type: club?.capacity_type ?? null,
          max_capacity: club?.max_capacity ?? null,
          assigned_count: assignedToClub.length,
          minimum_viable_enrollment: club?.minimum_viable_enrollment ?? null,
          interest_score: safeNumber(rating.interest_score),
          interest_level: rating.interest_level ?? null,
          is_top_choice:
            submission.top_choice_club_id === rating.club_offering_id,
          is_already_assigned: isAlreadyAssigned,
        };
      })
      .sort((a: any, b: any) => {
        if (a.is_top_choice !== b.is_top_choice) return a.is_top_choice ? -1 : 1;

        if (a.interest_score !== b.interest_score) {
          return b.interest_score - a.interest_score;
        }

        return clubDisplayName(a).localeCompare(clubDisplayName(b));
      });

    return {
      student_id: submission.student_id,
      student_name: submission.students?.student_name ?? null,
      student_email: submission.students?.student_email ?? null,
      grade: submission.students?.grade ?? null,
      teacher_homeroom_text:
        submission.students?.teacher_homeroom_text ?? null,
      requested: row.requested,
      assigned_count: row.assignedCount,
      unmet: row.unmet,
      got_top_choice: row.gotTop,
      got_high_interest_club: row.gotHighInterestClub,
      high_interest_requested_count: row.highInterestRequestedCount,
      high_interest_assigned_count: row.highInterestAssignedCount,
      attention_reason: row.attention?.reason ?? null,
      attention_detail: row.attention?.detail ?? null,
      is_addressed: addressedStudentIds.has(submission.student_id),
      current_clubs: currentClubs,
      interested_clubs: interestedClubs,
    };
  });

  const addableStudentRows = requestingSubmissions
    .map((submission) => {
      const assigned = assignmentsByStudentId.get(submission.student_id) ?? [];
      const requested = safeNumber(submission.max_clubs);
      const assignedCount = assigned.length;
      const unmet = Math.max(0, requested - assignedCount);

      return {
        student_id: submission.student_id,
        student_name: submission.students?.student_name ?? null,
        student_email: submission.students?.student_email ?? null,
        grade: submission.students?.grade ?? null,
        teacher_homeroom_text:
          submission.students?.teacher_homeroom_text ?? null,
        requested,
        assigned_count: assignedCount,
        unmet,
        top_choice_club_id: submission.top_choice_club_id ?? null,
        assigned_meeting_days: assigned.flatMap((assignment: any) =>
          Array.isArray(assignment.club_offerings?.meeting_days)
            ? assignment.club_offerings.meeting_days
            : []
        ),
        current_clubs: assigned.map((assignment: any) =>
          clubDisplayName(assignment.club_offerings)
        ),
      };
    })
    .sort((a, b) => {
      if (a.unmet !== b.unmet) return b.unmet - a.unmet;

      if (a.assigned_count !== b.assigned_count) {
        return a.assigned_count - b.assigned_count;
      }

      return String(a.student_name ?? '').localeCompare(
        String(b.student_name ?? '')
      );
    });

  const clubRosterRows = (clubs as any[]).map((club) => {
    const assigned = assignmentsByClubId.get(club.id) ?? [];
    const assignedStudentIds = new Set(
      assigned.map((assignment: any) => assignment.student_id)
    );

    const assignedCount = assigned.length;
    const capacity =
      club.capacity_type === 'limited' ? safeNumber(club.max_capacity) : null;
    const minimum = safeNumber(club.minimum_viable_enrollment);

    const isCancelled = cancelledClubIds.has(club.id);
    const isForceRun = forceRunClubIds.has(club.id);
    const isBelowMinimum = minimum > 0 && assignedCount < minimum && !isCancelled;
    const isAtCapacity = capacity !== null && assignedCount >= capacity && !isCancelled;
    const isOverCapacity = capacity !== null && assignedCount > capacity && !isCancelled;

    return {
      club_id: club.id,
      club_title: club.club_title,
      section_label: club.section_label,
      sponsor_name: club.sponsor_name,
      leader_email: club.leader_email,
      meeting_days: Array.isArray(club.meeting_days) ? club.meeting_days : [],
      capacity_type: club.capacity_type,
      max_capacity: club.max_capacity,
      minimum_viable_enrollment: club.minimum_viable_enrollment,
      assigned_count: assignedCount,
      is_cancelled: isCancelled,
      is_force_run: isForceRun,
      is_below_minimum: isBelowMinimum,
      is_at_capacity: isAtCapacity,
      is_over_capacity: isOverCapacity,
      addable_students: addableStudentRows
        .filter((student) => {
          if (assignedStudentIds.has(student.student_id)) return false;
          const interestScore =
            ratingByStudentClub.get(`${student.student_id}:${club.id}`) ?? 0;
          if (interestScore <= 0) return false;
          const eligibleGrades = Array.isArray(club.eligible_grades)
            ? club.eligible_grades.map(Number)
            : club.eligible_grade
              ? [Number(club.eligible_grade)]
              : [];
          if (
            club.grade_limited &&
            !eligibleGrades.includes(Number(student.grade))
          ) return false;
          const clubDays = Array.isArray(club.meeting_days) ? club.meeting_days : [];
          if (clubDays.some((day: string) => student.assigned_meeting_days.includes(day))) {
            return false;
          }
          return true;
        })
        .map((student) => ({
          ...student,
          interest_score:
            ratingByStudentClub.get(`${student.student_id}:${club.id}`) ?? 0,
          is_top_choice: student.top_choice_club_id === club.id,
        }))
        .sort((a, b) => {
          if (a.is_top_choice !== b.is_top_choice) return a.is_top_choice ? -1 : 1;
          if (a.interest_score !== b.interest_score) return b.interest_score - a.interest_score;
          if (a.unmet !== b.unmet) return b.unmet - a.unmet;
          return String(a.student_name ?? '').localeCompare(String(b.student_name ?? ''));
        }),
      assigned_students: assigned
        .sort((a: any, b: any) =>
          String(a.students?.student_name ?? '').localeCompare(
            String(b.students?.student_name ?? '')
          )
        )
        .map((assignment: any) => ({
          assignment_id: assignment.id,
          student_id: assignment.student_id,
          student_name: assignment.students?.student_name ?? null,
          student_email: assignment.students?.student_email ?? null,
          grade: assignment.students?.grade ?? null,
          teacher_homeroom_text:
            assignment.students?.teacher_homeroom_text ?? null,
          was_top_choice: assignment.was_top_choice ?? null,
          fairness_boost:
            assignment.fairness_boost === null ||
            assignment.fairness_boost === undefined
              ? null
              : Number(assignment.fairness_boost),
          assignment_pass:
            assignment.assignment_pass === null ||
            assignment.assignment_pass === undefined
              ? null
              : Number(assignment.assignment_pass),
          priority_score:
            assignment.priority_score === null ||
            assignment.priority_score === undefined
              ? null
              : Number(assignment.priority_score),
          interest_score:
            ratingByStudentClub.get(
              `${assignment.student_id}:${assignment.club_offering_id}`
            ) ?? null,
        })),
    };
  });

  const clubsBelowMinimumLive = clubRosterRows.filter(
    (row) => row.is_below_minimum
  );

  const clubsOverCapacity = clubRosterRows.filter(
    (row) => row.is_over_capacity
  );

  const assignmentPreviewRows = (assign as any[]).map((assignment) => ({
    assignment_id: assignment.id,
    student_id: assignment.student_id,
    student_name: assignment.students?.student_name ?? null,
    student_email: assignment.students?.student_email ?? null,
    grade: assignment.students?.grade ?? null,
    teacher_homeroom_text:
      assignment.students?.teacher_homeroom_text ?? null,
    club_offering_id: assignment.club_offering_id,
    club_title: assignment.club_offerings?.club_title ?? null,
    section_label: assignment.club_offerings?.section_label ?? null,
    was_top_choice: assignment.was_top_choice ?? null,
    interest_score:
      ratingByStudentClub.get(
        `${assignment.student_id}:${assignment.club_offering_id}`
      ) ?? null,
    fairness_boost:
      assignment.fairness_boost === null ||
      assignment.fairness_boost === undefined
        ? null
        : Number(assignment.fairness_boost),
    priority_score:
      assignment.priority_score === null ||
      assignment.priority_score === undefined
        ? null
        : Number(assignment.priority_score),
    assignment_pass:
      assignment.assignment_pass === null ||
      assignment.assignment_pass === undefined
        ? null
        : Number(assignment.assignment_pass),
    is_cancelled_assignment: cancelledClubIds.has(assignment.club_offering_id),
  }));

  const unaddressedNeedsAttentionRows = needsAttentionRows.filter(
    (row) => !row.is_addressed
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Review draft rosters before Google</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use this page to resolve club decisions and review warnings before sending the draft rosters to Google. Student names and roster editing stay in the Google workbook.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Current session:{' '}
          <span className="font-medium text-slate-700">
            {year.label} · {block.label}
          </span>
        </p>
      </div>

      {!run ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No draft rosters found for the current session. Run matching before
          reviewing rosters.
        </div>
      ) : null}

      {run ? (
        <div className="rounded-2xl border bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold">Draft rosters</h2>
              <p className="mt-1 text-sm text-slate-600">
                Created {formatDateTime(run.completed_at ?? run.started_at)}
              </p>
            </div>

            <form action={rematch}>
              <Button type="submit" variant="outline">
                Rematch after cancellations
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      {run ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Students placed"
            value={effectiveAssignments.length}
            detail="Current draft roster spots"
            tone="blue"
          />

          <MetricCard
            label="Students to check in Google"
            value={unaddressedNeedsAttentionRows.length}
            detail={`${zeroClubStudents.length} with no club · ${noHighInterestClubStudents.length} without high-interest`}
            tone={unaddressedNeedsAttentionRows.length > 0 ? 'yellow' : 'green'}
          />

          <MetricCard
            label="Small clubs"
            value={clubsBelowMinimumLive.length}
            detail="Need a keep-or-cancel decision"
            tone={clubsBelowMinimumLive.length > 0 ? 'yellow' : 'green'}
          />

          <MetricCard
            label="Over capacity"
            value={clubsOverCapacity.length}
            detail="After manual changes"
            tone={clubsOverCapacity.length > 0 ? 'red' : 'green'}
          />
        </div>
      ) : null}

      {run ? <FinalizeReadinessPanel transferControl={<PushDraftAssignmentsClient />} /> : null}

      {run && belowRows.length === 0 ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          No small-club decisions are needed. If the readiness panel is clear, send the draft rosters to Google from this page.
        </div>
      ) : null}

      {belowRows.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Small clubs to decide</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose whether to keep or cancel each club with low enrollment.
            </p>
          </div>

          {belowRows.map((b: any) => {
            const decision = decisionsByClubId.get(b.club_offering_id);
            const isCancelled = decision?.decision === 'cancel';
            const isForceRun = decision?.decision === 'force_run';

            const cardClass = isCancelled
              ? 'rounded-2xl border border-orange-300 bg-orange-50 p-4'
              : isForceRun
                ? 'rounded-2xl border border-green-300 bg-green-50 p-4'
                : 'rounded-2xl border border-yellow-300 bg-yellow-50 p-4';

            return (
              <div key={b.id} className={cardClass}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="font-semibold">
                      {clubDisplayName(b.club_offerings)}
                    </div>

                    <div className="text-sm text-slate-700">
                      Enrollment: {b.assigned_count} of{' '}
                      {b.club_offerings?.minimum_viable_enrollment} minimum
                    </div>

                    {isCancelled ? (
                      <div className="rounded-xl border border-orange-300 bg-white p-3 text-sm text-orange-900">
                        <div className="font-semibold">This club is canceled</div>
                        <div>
                          Students assigned to this club will not be included in
                          final rosters. To try placing them elsewhere, use{' '}
                          <span className="font-semibold">
                            Rematch after cancellations
                          </span>
                          .
                        </div>

                        {decision?.notes ? (
                          <div className="mt-2">
                            <span className="font-medium">Notes:</span>{' '}
                            {decision.notes}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isForceRun ? (
                      <div className="rounded-xl border border-green-300 bg-white p-3 text-sm text-green-900">
                        <div className="font-semibold">This club will run</div>
                        <div>
                          This club will stay on the roster even though it is
                          below the usual minimum.
                        </div>

                        {decision?.notes ? (
                          <div className="mt-2">
                            <span className="font-medium">Notes:</span>{' '}
                            {decision.notes}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {isCancelled ? (
                    <form action={undoCancel}>
                      <input
                        type="hidden"
                        name="club_offering_id"
                        value={b.club_offering_id}
                      />

                      <Button type="submit" variant="outline">
                        Undo cancel
                      </Button>
                    </form>
                  ) : null}
                </div>

                {!isCancelled ? (
                  <form
                    action={decide}
                    className="mt-4 flex flex-col gap-3 md:flex-row"
                  >
                    <input
                      type="hidden"
                      name="club_offering_id"
                      value={b.club_offering_id}
                    />

                    <select
                      name="decision"
                      defaultValue={decision?.decision ?? ''}
                      className="rounded border p-2"
                      required
                    >
                      <option value="" disabled>
                        Choose decision
                      </option>
                      <option value="force_run">Keep this club</option>
                      <option value="cancel">Cancel this club</option>
                    </select>

                    <input
                      name="notes"
                      className="min-w-0 flex-1 rounded border p-2"
                      placeholder="Optional note"
                      defaultValue={decision?.notes ?? ''}
                    />

                    <Button type="submit">Save decision</Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {run ? <ReviewNeedsAttentionClient students={needsAttentionRows} /> : null}

      {run ? <ReviewRosterClient clubs={clubRosterRows} /> : null}

      {run ? <ManualOverrideLog overrides={overrides as any[]} /> : null}

      {run ? (
        <details className="rounded-2xl border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
            Show assignment details
          </summary>

          <div className="border-t p-4">
            <ReviewAssignmentPreviewClient assignments={assignmentPreviewRows} />
          </div>
        </details>
      ) : null}
    </div>
  );
}