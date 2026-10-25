import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function displayClubName(club: any) {
  if (!club) return 'Unknown club';
  return (
    [club.club_title, club.section_label].filter(Boolean).join(' — ') ||
    'Unknown club'
  );
}

function StatusBadge({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'purple' | 'slate';
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
                : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'slate';
}) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50'
        : tone === 'red'
          ? 'border-red-200 bg-red-50'
          : tone === 'orange'
            ? 'border-orange-200 bg-orange-50'
            : tone === 'blue'
              ? 'border-blue-200 bg-blue-50'
              : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {detail ? (
        <div className="mt-1 text-xs text-slate-500">{detail}</div>
      ) : null}
    </div>
  );
}

function ChangeBadge({ actionType }: { actionType: string | null | undefined }) {
  if (actionType === 'manual_add') {
    return <StatusBadge label="Added by coordinator" tone="blue" />;
  }

  if (actionType === 'manual_remove') {
    return <StatusBadge label="Removed by coordinator" tone="orange" />;
  }

  if (actionType === 'manual_move') {
    return <StatusBadge label="Moved by coordinator" tone="purple" />;
  }

  if (actionType === 'needs_attention_addressed') {
    return <StatusBadge label="Marked reviewed" tone="green" />;
  }

  return <StatusBadge label="Roster change" tone="slate" />;
}

export default async function ArchivedBlockPage({
  params,
}: {
  params: Promise<{ schoolYearId: string; blockId: string }>;
}) {
  const { schoolYearId, blockId } = await params;
  const supabase = await createClient();

  const [{ data: schoolYear }, { data: block }] = await Promise.all([
    supabase
      .from('school_years')
      .select('*')
      .eq('id', schoolYearId)
      .maybeSingle(),
    supabase
      .from('blocks')
      .select('*')
      .eq('id', blockId)
      .eq('school_year_id', schoolYearId)
      .maybeSingle(),
  ]);

  if (!schoolYear || !block) {
    notFound();
  }

  const [
    { data: clubsData = [] },
    { data: finalAssignmentsData = [] },
    { data: draftAssignmentsData = [] },
    { data: submissionsData = [] },
    { data: matchRunsData = [] },
    { data: belowMinimumDecisionsData = [] },
    { data: overridesData = [] },
    { data: historySnapshot },
  ] = await Promise.all([
    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', blockId)
      .order('club_title', { ascending: true }),
    supabase
      .from('final_assignments')
      .select(
        '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(*)'
      )
      .eq('block_id', blockId),
    supabase
      .from('draft_assignments')
      .select(
        '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(*)'
      ),
    supabase
      .from('student_submissions')
      .select('*, students(student_name, student_email, grade, teacher_homeroom_text)')
      .eq('block_id', blockId)
      .eq('is_latest', true),
    supabase
      .from('match_runs')
      .select('*')
      .eq('block_id', blockId)
      .order('completed_at', { ascending: false }),
    supabase
      .from('below_minimum_decisions')
      .select('*, club_offerings(club_title, section_label)')
      .eq('block_id', blockId),
    supabase
      .from('assignment_overrides')
      .select(
        '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(club_title, section_label)'
      )
      .eq('block_id', blockId)
      .order('created_at', { ascending: false }),
    supabase
      .from('history_snapshots')
      .select('*')
      .eq('block_id', blockId)
      .maybeSingle(),
  ]);

  const clubRows = (clubsData ?? []) as any[];
  const finalAssignmentRows = (finalAssignmentsData ?? []) as any[];
  const draftAssignmentRows = (draftAssignmentsData ?? []) as any[];
  const submissionRows = (submissionsData ?? []) as any[];
  const matchRunRows = (matchRunsData ?? []) as any[];
  const belowMinimumDecisionRows = (belowMinimumDecisionsData ?? []) as any[];
  const overrideRows = (overridesData ?? []) as any[];

  let snapshotOutcomes: any[] = [];

  if (historySnapshot?.id) {
    const { data: outcomes = [] } = await supabase
      .from('history_student_outcomes')
      .select('*, students(student_name, student_email, grade, teacher_homeroom_text)')
      .eq('history_snapshot_id', historySnapshot.id);

    snapshotOutcomes = (outcomes ?? []) as any[];
  }

  const latestCompletedRun = matchRunRows.find(
    (run) => run.status === 'completed'
  );

  const latestRunId = latestCompletedRun?.id ?? null;

  const draftAssignmentsForLatestRun = latestRunId
    ? draftAssignmentRows.filter(
        (assignment) => assignment.match_run_id === latestRunId
      )
    : [];

  const finalAssignmentsByClubId = new Map<string, any[]>();
  const draftAssignmentsByClubId = new Map<string, any[]>();

  for (const assignment of finalAssignmentRows) {
    const rows = finalAssignmentsByClubId.get(assignment.club_offering_id) ?? [];
    rows.push(assignment);
    finalAssignmentsByClubId.set(assignment.club_offering_id, rows);
  }

  for (const assignment of draftAssignmentsForLatestRun) {
    const rows = draftAssignmentsByClubId.get(assignment.club_offering_id) ?? [];
    rows.push(assignment);
    draftAssignmentsByClubId.set(assignment.club_offering_id, rows);
  }

  const submittedStudentIds = new Set(
    submissionRows.map((submission) => submission.student_id)
  );

  const finalAssignedStudentIds = new Set(
    finalAssignmentRows.map((assignment) => assignment.student_id)
  );

  const zeroClubOutcomes = snapshotOutcomes.filter(
    (outcome) => outcome.zero_club_flag
  );

  const unmetDemandOutcomes = snapshotOutcomes.filter(
    (outcome) => safeNumber(outcome.unmet_demand) > 0
  );

  const topChoiceOutcomes = snapshotOutcomes.filter(
    (outcome) => outcome.got_top_choice
  );

  const isFinalized = block.status === 'finalized' || Boolean(block.finalized_at);

  const clubsWithFinalRosters = clubRows.filter((club) => {
    const assigned = finalAssignmentsByClubId.get(club.id) ?? [];
    return assigned.length > 0;
  });

  const clubsWithoutFinalRosters = clubRows.filter((club) => {
    const assigned = finalAssignmentsByClubId.get(club.id) ?? [];
    return assigned.length === 0;
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3">
          <Link
            href={`/admin/archive/${schoolYear.id}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Back to {schoolYear.label ?? 'school year'}
          </Link>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {schoolYear.label ?? 'School year'} / {block.label ?? 'Session'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              View saved rosters, student choices, and coordinator changes for this session.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={isFinalized ? 'Rosters finalized' : block.status ?? 'Not finalized'}
              tone={isFinalized ? 'green' : 'yellow'}
            />
            {block.matching_locked ? (
              <StatusBadge label="Matching locked" tone="slate" />
            ) : null}
            {historySnapshot ? (
              <StatusBadge label="Saved results" tone="green" />
            ) : (
              <StatusBadge label="No saved results" tone="slate" />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
        <div className="font-semibold">Read-only view</div>
        <p className="mt-1 text-sm">
          This page is for reference and does not include edit actions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Clubs" value={clubRows.length} />
        <Metric
          label="Final roster spots"
          value={finalAssignmentRows.length}
          tone={finalAssignmentRows.length > 0 ? 'green' : 'slate'}
        />
        <Metric
          label="Draft roster spots"
          value={draftAssignmentsForLatestRun.length}
          detail={latestRunId ? 'Latest matching run' : 'No completed run'}
        />
        <Metric
          label="Student choices"
          value={submissionRows.length}
          detail="Latest only"
        />
        <Metric
          label="Roster changes"
          value={overrideRows.length}
          tone={overrideRows.length > 0 ? 'orange' : 'slate'}
        />
        <Metric
          label="Small-club decisions"
          value={belowMinimumDecisionRows.length}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Students submitted" value={submittedStudentIds.size} />
        <Metric
          label="Students on final rosters"
          value={finalAssignedStudentIds.size}
          tone={finalAssignedStudentIds.size > 0 ? 'green' : 'slate'}
        />
        <Metric
          label="Students wanting more clubs"
          value={unmetDemandOutcomes.length}
          tone={unmetDemandOutcomes.length > 0 ? 'orange' : 'green'}
        />
        <Metric
          label="Students with no club"
          value={zeroClubOutcomes.length}
          tone={zeroClubOutcomes.length > 0 ? 'red' : 'green'}
          detail={`${topChoiceOutcomes.length} got top choice`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Finalized
              </div>
              <div className="mt-1 font-medium text-slate-900">
                {formatDateTime(block.finalized_at)}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Last matching run
              </div>
              <div className="mt-1 font-medium text-slate-900">
                {latestCompletedRun
                  ? `${latestCompletedRun.run_type ?? 'match'} · ${formatDateTime(
                      latestCompletedRun.completed_at
                    )}`
                  : '—'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Final rosters by club</h2>
          <p className="mt-1 text-sm text-slate-600">
            Final rosters are grouped by club.
          </p>
        </div>

        {clubRows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
            No clubs were found for this session.
          </div>
        ) : (
          <div className="space-y-3">
            {clubRows.map((club) => {
              const assigned = (finalAssignmentsByClubId.get(club.id) ?? []).sort(
                (a, b) =>
                  String(a.students?.student_name ?? '').localeCompare(
                    String(b.students?.student_name ?? '')
                  )
              );

              const draftAssigned = draftAssignmentsByClubId.get(club.id) ?? [];
              const capacityLabel =
                club.capacity_type === 'unlimited'
                  ? 'Unlimited'
                  : club.max_capacity ?? '—';

              const isBelowMinimum =
                safeNumber(club.minimum_viable_enrollment) > 0 &&
                assigned.length < safeNumber(club.minimum_viable_enrollment);

              const isOverCapacity =
                club.capacity_type === 'limited' &&
                safeNumber(club.max_capacity) > 0 &&
                assigned.length > safeNumber(club.max_capacity);

              return (
                <div key={club.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900">
                          {displayClubName(club)}
                        </h3>

                        {isBelowMinimum ? (
                          <StatusBadge label="Small club" tone="yellow" />
                        ) : null}

                        {isOverCapacity ? (
                          <StatusBadge label="Over capacity" tone="red" />
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-slate-600">
                        {Array.isArray(club.meeting_days) && club.meeting_days.length > 0
                          ? club.meeting_days.join(', ')
                          : 'No day set'}
                        {club.sponsor_name ? ` · ${club.sponsor_name}` : ''}
                      </div>
                    </div>

                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <Metric label="Final" value={assigned.length} />
                      <Metric label="Draft" value={draftAssigned.length} />
                      <Metric label="Spots" value={capacityLabel} />
                    </div>
                  </div>

                  {assigned.length === 0 ? (
                    <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
                      No final roster spots for this club.
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead className="bg-slate-50 text-left text-slate-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Student</th>
                            <th className="px-3 py-2 font-medium">Grade</th>
                            <th className="px-3 py-2 font-medium">Homeroom</th>
                            <th className="px-3 py-2 font-medium">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {assigned.map((assignment) => (
                            <tr key={assignment.id}>
                              <td className="px-3 py-2 font-medium text-slate-900">
                                {assignment.students?.student_name ?? 'Unknown student'}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {assignment.students?.grade ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {assignment.students?.teacher_homeroom_text ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-slate-700">
                                {assignment.students?.student_email ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <details className="rounded-2xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
          Show small-club decisions
        </summary>
        <div className="border-t p-5">
          {belowMinimumDecisionRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No small-club decisions were recorded for this session.
            </div>
          ) : (
            <div className="space-y-2">
              {belowMinimumDecisionRows.map((decision) => (
                <div key={decision.id} className="rounded-2xl border bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {displayClubName(decision.club_offerings)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {decision.notes || 'No notes entered.'}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={decision.decision === 'cancel' ? 'Canceled' : 'Will run'}
                        tone={decision.decision === 'cancel' ? 'orange' : 'green'}
                      />
                      <StatusBadge
                        label={formatDateTime(decision.decided_at)}
                        tone="slate"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      <details className="rounded-2xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
          Show roster change history
        </summary>
        <div className="border-t p-5">
          {overrideRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No roster changes were recorded for this session.
            </div>
          ) : (
            <div className="rounded-2xl border bg-white">
              <div className="divide-y">
                {overrideRows.map((override) => (
                  <div key={override.id} className="p-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChangeBadge actionType={override.action_type} />
                        <StatusBadge
                          label={formatDateTime(override.created_at)}
                          tone="slate"
                        />
                      </div>

                      <div className="font-medium text-slate-900">
                        {override.students?.student_name ?? 'Unknown student'}
                        {override.club_offerings ? (
                          <> → {displayClubName(override.club_offerings)}</>
                        ) : null}
                      </div>

                      <div className="text-sm text-slate-600">
                        Grade {override.students?.grade ?? '—'} ·{' '}
                        {override.students?.teacher_homeroom_text ?? 'No homeroom'}
                        {override.students?.student_email
                          ? ` · ${override.students.student_email}`
                          : ''}
                      </div>

                      <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                        <span className="font-medium">Note:</span>{' '}
                        {override.reason || 'No note entered.'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      <details className="rounded-2xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
          Show student outcomes
        </summary>
        <div className="border-t p-5">
          {!historySnapshot ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No saved student outcomes were found for this session.
            </div>
          ) : snapshotOutcomes.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              Saved results exist, but no student outcome rows were found.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Grade</th>
                    <th className="px-4 py-3 font-medium">Clubs received</th>
                    <th className="px-4 py-3 font-medium">Got top choice</th>
                    <th className="px-4 py-3 font-medium">Still wanted</th>
                    <th className="px-4 py-3 font-medium">No club</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {snapshotOutcomes
                    .sort((a, b) =>
                      String(a.students?.student_name ?? '').localeCompare(
                        String(b.students?.student_name ?? '')
                      )
                    )
                    .map((outcome) => (
                      <tr key={outcome.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {outcome.students?.student_name ?? 'Unknown student'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {outcome.students?.grade ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {outcome.clubs_received ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          {outcome.got_top_choice ? (
                            <StatusBadge label="Yes" tone="green" />
                          ) : (
                            <StatusBadge label="No" tone="slate" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {outcome.unmet_demand ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          {outcome.zero_club_flag ? (
                            <StatusBadge label="Yes" tone="red" />
                          ) : (
                            <StatusBadge label="No" tone="green" />
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      {clubsWithoutFinalRosters.length > 0 && clubsWithFinalRosters.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {clubsWithoutFinalRosters.length} club
          {clubsWithoutFinalRosters.length === 1 ? '' : 's'} had no final roster
          spots in this session.
        </div>
      ) : null}
    </div>
  );
}
