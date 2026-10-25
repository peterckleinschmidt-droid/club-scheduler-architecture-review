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

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
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

function ChangeBadge({
  actionType,
}: {
  actionType: string | null | undefined;
}) {
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

function CsvDownloadCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border bg-white p-4 text-sm shadow-sm hover:border-blue-300 hover:bg-blue-50"
    >
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-slate-600">{description}</div>
    </Link>
  );
}

export default async function ArchivedBlockReportsPage({
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
    { data: submissionsData = [] },
    { data: overridesData = [] },
    { data: belowMinimumDecisionsData = [] },
    { data: historySnapshot },
    { data: matchRunsData = [] },
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
      .from('student_submissions')
      .select('*, students(student_name, student_email, grade, teacher_homeroom_text)')
      .eq('block_id', blockId)
      .eq('is_latest', true),
    supabase
      .from('assignment_overrides')
      .select(
        '*, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(club_title, section_label)'
      )
      .eq('block_id', blockId)
      .order('created_at', { ascending: false }),
    supabase
      .from('below_minimum_decisions')
      .select('*, club_offerings(club_title, section_label)')
      .eq('block_id', blockId),
    supabase
      .from('history_snapshots')
      .select('*')
      .eq('block_id', blockId)
      .maybeSingle(),
    supabase
      .from('match_runs')
      .select('*')
      .eq('block_id', blockId)
      .order('completed_at', { ascending: false }),
  ]);

  const clubRows = (clubsData ?? []) as any[];
  const finalAssignmentRows = (finalAssignmentsData ?? []) as any[];
  const submissionRows = (submissionsData ?? []) as any[];
  const overrideRows = (overridesData ?? []) as any[];
  const belowMinimumDecisionRows = (belowMinimumDecisionsData ?? []) as any[];
  const matchRunRows = (matchRunsData ?? []) as any[];

  let historyOutcomeRows: any[] = [];

  if (historySnapshot?.id) {
    const { data: outcomesData = [] } = await supabase
      .from('history_student_outcomes')
      .select('*, students(student_name, student_email, grade, teacher_homeroom_text)')
      .eq('history_snapshot_id', historySnapshot.id);

    historyOutcomeRows = (outcomesData ?? []) as any[];
  }

  const finalAssignmentsByClubId = new Map<string, any[]>();
  const finalAssignmentsByStudentId = new Map<string, any[]>();

  for (const assignment of finalAssignmentRows) {
    const clubAssignments =
      finalAssignmentsByClubId.get(assignment.club_offering_id) ?? [];
    clubAssignments.push(assignment);
    finalAssignmentsByClubId.set(assignment.club_offering_id, clubAssignments);

    const studentAssignments =
      finalAssignmentsByStudentId.get(assignment.student_id) ?? [];
    studentAssignments.push(assignment);
    finalAssignmentsByStudentId.set(assignment.student_id, studentAssignments);
  }

  const latestCompletedRun = matchRunRows.find(
    (run) => run.status === 'completed'
  );

  const submittedStudentIds = new Set(
    submissionRows.map((submission) => submission.student_id)
  );

  const finalizedStudentIds = new Set(
    finalAssignmentRows.map((assignment) => assignment.student_id)
  );

  const zeroClubOutcomes = historyOutcomeRows.filter(
    (outcome) => outcome.zero_club_flag
  );

  const unmetDemandOutcomes = historyOutcomeRows.filter(
    (outcome) => safeNumber(outcome.unmet_demand) > 0
  );

  const topChoiceOutcomes = historyOutcomeRows.filter(
    (outcome) => outcome.got_top_choice
  );

  const manualAdds = overrideRows.filter(
    (override) => override.action_type === 'manual_add'
  );

  const manualRemoves = overrideRows.filter(
    (override) => override.action_type === 'manual_remove'
  );

  const addressedRows = overrideRows.filter(
    (override) => override.action_type === 'needs_attention_addressed'
  );

  const cancelledDecisions = belowMinimumDecisionRows.filter(
    (decision) => decision.decision === 'cancel'
  );

  const forceRunDecisions = belowMinimumDecisionRows.filter(
    (decision) => decision.decision === 'force_run'
  );

  const clubSummaryRows = clubRows
    .map((club) => {
      const assigned = finalAssignmentsByClubId.get(club.id) ?? [];
      const assignedCount = assigned.length;
      const capacity =
        club.capacity_type === 'limited' ? safeNumber(club.max_capacity) : null;
      const minimum = safeNumber(club.minimum_viable_enrollment);

      const isBelowMinimum = minimum > 0 && assignedCount < minimum;
      const isOverCapacity =
        capacity !== null && capacity > 0 && assignedCount > capacity;

      return {
        club,
        assignedCount,
        capacity,
        minimum,
        isBelowMinimum,
        isOverCapacity,
      };
    })
    .sort((a, b) => displayClubName(a.club).localeCompare(displayClubName(b.club)));

  const finalRosterRows = [...finalAssignmentRows].sort((a, b) => {
    const clubCompare = displayClubName(a.club_offerings).localeCompare(
      displayClubName(b.club_offerings)
    );

    if (clubCompare !== 0) return clubCompare;

    return String(a.students?.student_name ?? '').localeCompare(
      String(b.students?.student_name ?? '')
    );
  });

  const studentAssignmentRows = [...submissionRows]
    .map((submission) => {
      const assignments = finalAssignmentsByStudentId.get(submission.student_id) ?? [];
      const requested = safeNumber(submission.max_clubs);
      const assignedCount = assignments.length;
      const unmet = Math.max(0, requested - assignedCount);

      return {
        submission,
        assignments,
        requested,
        assignedCount,
        unmet,
      };
    })
    .sort((a, b) =>
      String(a.submission.students?.student_name ?? '').localeCompare(
        String(b.submission.students?.student_name ?? '')
      )
    );

  const finalizedRate = percent(finalizedStudentIds.size, submittedStudentIds.size);
  const topChoiceRate = percent(topChoiceOutcomes.length, historyOutcomeRows.length);
  const zeroClubRate = percent(zeroClubOutcomes.length, historyOutcomeRows.length);

  const baseReportsHref = `/admin/archive/${schoolYear.id}/blocks/${block.id}/reports`;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/archive/${schoolYear.id}/blocks/${block.id}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Back to session
          </Link>

          <span className="text-sm text-slate-400">/</span>

          <Link
            href={`/admin/archive/${schoolYear.id}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Back to year
          </Link>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Reports / {schoolYear.label ?? 'School year'} / {block.label ?? 'Session'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              View and download saved roster reports for this session.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={block.status === 'finalized' || block.finalized_at ? 'Rosters finalized' : 'Not finalized'}
              tone={block.status === 'finalized' || block.finalized_at ? 'green' : 'yellow'}
            />
            {historySnapshot ? (
              <StatusBadge label="Saved results" tone="green" />
            ) : (
              <StatusBadge label="No saved results" tone="slate" />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
        <div className="font-semibold">Read-only reports</div>
        <p className="mt-1 text-sm">
          These reports are saved for reference and do not include edit actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Download spreadsheets</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            Download saved reports for this session.
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <CsvDownloadCard
              href={`${baseReportsHref}/final-roster.csv`}
              title="Final roster"
              description="One row per student-club roster spot."
            />
            <CsvDownloadCard
              href={`${baseReportsHref}/club-summary.csv`}
              title="Club summary"
              description="Club enrollment, spots, minimums, and status."
            />
            <CsvDownloadCard
              href={`${baseReportsHref}/student-assignments.csv`}
              title="Student assignments"
              description="Clubs wanted, clubs received, and clubs still wanted."
            />
            <CsvDownloadCard
              href={`${baseReportsHref}/student-outcomes.csv`}
              title="Student outcomes"
              description="Top choice, clubs received, and no-club flags."
            />
            <CsvDownloadCard
              href={`${baseReportsHref}/overrides.csv`}
              title="Roster changes"
              description="Coordinator adds, removes, reviewed notes, and reasons."
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Clubs" value={clubRows.length} />
        <Metric
          label="Final roster spots"
          value={finalAssignmentRows.length}
          tone={finalAssignmentRows.length > 0 ? 'green' : 'slate'}
        />
        <Metric label="Students submitted" value={submittedStudentIds.size} />
        <Metric
          label="Students on rosters"
          value={finalizedStudentIds.size}
          detail={finalizedRate}
          tone={finalizedStudentIds.size > 0 ? 'green' : 'slate'}
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
        <Metric
          label="Got top choice"
          value={topChoiceOutcomes.length}
          detail={topChoiceRate}
          tone={topChoiceOutcomes.length > 0 ? 'green' : 'slate'}
        />
        <Metric
          label="Students wanting more clubs"
          value={unmetDemandOutcomes.length}
          tone={unmetDemandOutcomes.length > 0 ? 'orange' : 'green'}
        />
        <Metric
          label="Students with no club"
          value={zeroClubOutcomes.length}
          detail={zeroClubRate}
          tone={zeroClubOutcomes.length > 0 ? 'red' : 'green'}
        />
        <Metric
          label="Last matching run"
          value={latestCompletedRun?.status ?? '—'}
          detail={formatDateTime(latestCompletedRun?.completed_at)}
          tone={latestCompletedRun ? 'green' : 'slate'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Club summary</CardTitle>
        </CardHeader>
        <CardContent>
          {clubSummaryRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No clubs were found for this session.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Club</th>
                    <th className="px-4 py-3 font-medium">Leader</th>
                    <th className="px-4 py-3 font-medium">Days</th>
                    <th className="px-4 py-3 font-medium">Students</th>
                    <th className="px-4 py-3 font-medium">Spots</th>
                    <th className="px-4 py-3 font-medium">Minimum</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clubSummaryRows.map((row) => (
                    <tr key={row.club.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {displayClubName(row.club)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.club.sponsor_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {Array.isArray(row.club.meeting_days) && row.club.meeting_days.length > 0
                          ? row.club.meeting_days.join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.assignedCount}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.club.capacity_type === 'unlimited'
                          ? 'Unlimited'
                          : row.club.max_capacity ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.club.minimum_viable_enrollment ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {row.isBelowMinimum ? (
                            <StatusBadge label="Small club" tone="yellow" />
                          ) : null}
                          {row.isOverCapacity ? (
                            <StatusBadge label="Over capacity" tone="red" />
                          ) : null}
                          {!row.isBelowMinimum && !row.isOverCapacity ? (
                            <StatusBadge label="OK" tone="green" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Final roster</CardTitle>
        </CardHeader>
        <CardContent>
          {finalRosterRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No final roster rows were found for this session.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Club</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Grade</th>
                    <th className="px-4 py-3 font-medium">Homeroom</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {finalRosterRows.map((assignment) => (
                    <tr key={assignment.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {displayClubName(assignment.club_offerings)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {assignment.students?.student_name ?? 'Unknown student'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {assignment.students?.grade ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {assignment.students?.teacher_homeroom_text ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {assignment.students?.student_email ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Student assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {studentAssignmentRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No student choices were found for this session.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-white">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Grade</th>
                    <th className="px-4 py-3 font-medium">Wanted</th>
                    <th className="px-4 py-3 font-medium">Received</th>
                    <th className="px-4 py-3 font-medium">Still wanted</th>
                    <th className="px-4 py-3 font-medium">Clubs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {studentAssignmentRows.map((row) => (
                    <tr key={row.submission.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.submission.students?.student_name ?? 'Unknown student'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.submission.students?.grade ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.requested}</td>
                      <td className="px-4 py-3 text-slate-700">{row.assignedCount}</td>
                      <td className="px-4 py-3 text-slate-700">{row.unmet}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.assignments.length > 0
                          ? row.assignments
                              .map((assignment) => displayClubName(assignment.club_offerings))
                              .join(', ')
                          : 'None'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <details className="rounded-2xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
          Show student outcomes
        </summary>
        <div className="border-t p-5">
          {!historySnapshot ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No saved student outcomes were found for this session.
            </div>
          ) : historyOutcomeRows.length === 0 ? (
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
                  {[...historyOutcomeRows]
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

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="rounded-2xl border bg-white">
          <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
            Show small-club decisions
          </summary>
          <div className="border-t p-5">
            {belowMinimumDecisionRows.length === 0 ? (
              <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
                No small-club decisions were recorded.
              </div>
            ) : (
              <div className="space-y-2">
                {belowMinimumDecisionRows.map((decision) => (
                  <div key={decision.id} className="rounded-xl border bg-white p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="font-medium text-slate-900">
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

            {belowMinimumDecisionRows.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Metric label="Will run" value={forceRunDecisions.length} />
                <Metric label="Canceled" value={cancelledDecisions.length} />
              </div>
            ) : null}
          </div>
        </details>

        <details className="rounded-2xl border bg-white">
          <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
            Show roster change history
          </summary>
          <div className="border-t p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Added" value={manualAdds.length} tone="blue" />
              <Metric label="Removed" value={manualRemoves.length} tone="orange" />
              <Metric label="Marked reviewed" value={addressedRows.length} tone="green" />
            </div>

            {overrideRows.length === 0 ? (
              <div className="mt-4 rounded-2xl border bg-white p-4 text-sm text-slate-600">
                No roster changes were recorded.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {overrideRows.slice(0, 25).map((override) => (
                  <div key={override.id} className="rounded-xl border bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChangeBadge actionType={override.action_type} />
                      <StatusBadge
                        label={formatDateTime(override.created_at)}
                        tone="slate"
                      />
                    </div>

                    <div className="mt-2 font-medium text-slate-900">
                      {override.students?.student_name ?? 'Unknown student'}
                      {override.club_offerings ? (
                        <> → {displayClubName(override.club_offerings)}</>
                      ) : null}
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      {override.reason || 'No note entered.'}
                    </div>
                  </div>
                ))}

                {overrideRows.length > 25 ? (
                  <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
                    Showing 25 of {overrideRows.length} roster changes.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
