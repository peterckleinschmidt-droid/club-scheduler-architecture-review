import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusBadge({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'slate';
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

function BlockStatusBadges({ block }: { block: any }) {
  const isFinalized =
    block.status === 'finalized' || Boolean(block.finalized_at);

  return (
    <div className="flex flex-wrap gap-2">
      <StatusBadge
        label={isFinalized ? 'Rosters finalized' : block.status ?? 'Draft'}
        tone={isFinalized ? 'green' : 'blue'}
      />

      {block.matching_locked ? (
        <StatusBadge label="Matching locked" tone="slate" />
      ) : null}

      {block.public_club_submission_open ? (
        <StatusBadge label="Club sign-up open" tone="yellow" />
      ) : null}

      {block.student_form_open ? (
        <StatusBadge label="Student choices open" tone="yellow" />
      ) : null}
    </div>
  );
}

export default async function ArchivedSchoolYearPage({
  params,
}: {
  params: Promise<{ schoolYearId: string }>;
}) {
  const { schoolYearId } = await params;

  const supabase = await createClient();
  const { year: activeYear } = await getActiveContext();

  const { data: schoolYear } = await supabase
    .from('school_years')
    .select('*')
    .eq('id', schoolYearId)
    .maybeSingle();

  if (!schoolYear) {
    notFound();
  }

  const [
    { data: blocksData = [] },
    { data: studentsData = [] },
    { data: clubOfferingsData = [] },
    { data: finalAssignmentsData = [] },
    { data: historySnapshotsData = [] },
    { data: matchRunsData = [] },
    { data: submissionsData = [] },
    { data: overridesData = [] },
    { data: belowMinimumDecisionsData = [] },
  ] = await Promise.all([
    supabase
      .from('blocks')
      .select('*')
      .eq('school_year_id', schoolYearId)
      .order('label', { ascending: true }),
    supabase
      .from('students')
      .select('id, school_year_id')
      .eq('school_year_id', schoolYearId),
    supabase.from('club_offerings').select('id, block_id'),
    supabase.from('final_assignments').select('id, block_id'),
    supabase
      .from('history_snapshots')
      .select('id, school_year_id, block_id, committed_at')
      .eq('school_year_id', schoolYearId),
    supabase.from('match_runs').select('id, block_id, status, completed_at'),
    supabase.from('student_submissions').select('id, block_id, is_latest'),
    supabase.from('assignment_overrides').select('id, block_id'),
    supabase.from('below_minimum_decisions').select('id, block_id'),
  ]);

  const blockRows = (blocksData ?? []) as any[];
  const studentRows = (studentsData ?? []) as any[];
  const clubOfferingRows = (clubOfferingsData ?? []) as any[];
  const finalAssignmentRows = (finalAssignmentsData ?? []) as any[];
  const historySnapshotRows = (historySnapshotsData ?? []) as any[];
  const matchRunRows = (matchRunsData ?? []) as any[];
  const submissionRows = (submissionsData ?? []) as any[];
  const overrideRows = (overridesData ?? []) as any[];
  const belowMinimumDecisionRows = (belowMinimumDecisionsData ?? []) as any[];

  const blockIds = new Set(blockRows.map((block) => block.id));

  const clubsByBlockId = new Map<string, any[]>();
  const finalsByBlockId = new Map<string, any[]>();
  const snapshotsByBlockId = new Map<string, any[]>();
  const matchRunsByBlockId = new Map<string, any[]>();
  const submissionsByBlockId = new Map<string, any[]>();
  const overridesByBlockId = new Map<string, any[]>();
  const belowMinimumDecisionsByBlockId = new Map<string, any[]>();

  for (const club of clubOfferingRows) {
    if (!blockIds.has(club.block_id)) continue;

    const rows = clubsByBlockId.get(club.block_id) ?? [];
    rows.push(club);
    clubsByBlockId.set(club.block_id, rows);
  }

  for (const finalAssignment of finalAssignmentRows) {
    if (!blockIds.has(finalAssignment.block_id)) continue;

    const rows = finalsByBlockId.get(finalAssignment.block_id) ?? [];
    rows.push(finalAssignment);
    finalsByBlockId.set(finalAssignment.block_id, rows);
  }

  for (const snapshot of historySnapshotRows) {
    if (!blockIds.has(snapshot.block_id)) continue;

    const rows = snapshotsByBlockId.get(snapshot.block_id) ?? [];
    rows.push(snapshot);
    snapshotsByBlockId.set(snapshot.block_id, rows);
  }

  for (const run of matchRunRows) {
    if (!blockIds.has(run.block_id)) continue;

    const rows = matchRunsByBlockId.get(run.block_id) ?? [];
    rows.push(run);
    matchRunsByBlockId.set(run.block_id, rows);
  }

  for (const submission of submissionRows) {
    if (!blockIds.has(submission.block_id)) continue;
    if (!submission.is_latest) continue;

    const rows = submissionsByBlockId.get(submission.block_id) ?? [];
    rows.push(submission);
    submissionsByBlockId.set(submission.block_id, rows);
  }

  for (const override of overrideRows) {
    if (!blockIds.has(override.block_id)) continue;

    const rows = overridesByBlockId.get(override.block_id) ?? [];
    rows.push(override);
    overridesByBlockId.set(override.block_id, rows);
  }

  for (const decision of belowMinimumDecisionRows) {
    if (!blockIds.has(decision.block_id)) continue;

    const rows = belowMinimumDecisionsByBlockId.get(decision.block_id) ?? [];
    rows.push(decision);
    belowMinimumDecisionsByBlockId.set(decision.block_id, rows);
  }

  const finalizedBlocks = blockRows.filter(
    (block) => block.status === 'finalized' || Boolean(block.finalized_at)
  );

  const activeYearId = activeYear?.id ?? null;
  const isActiveYear = activeYearId === schoolYear.id;
  const hasSavedResults = historySnapshotRows.length > 0 || finalizedBlocks.length > 0;

  const totalClubOfferingsForYear = Array.from(clubsByBlockId.values()).reduce(
    (sum, rows) => sum + rows.length,
    0
  );

  const totalFinalAssignmentsForYear = Array.from(
    finalsByBlockId.values()
  ).reduce((sum, rows) => sum + rows.length, 0);

  const totalLatestSubmissionsForYear = Array.from(
    submissionsByBlockId.values()
  ).reduce((sum, rows) => sum + rows.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3">
          <Link
            href="/admin/archive"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Back to Past Years
          </Link>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {schoolYear.label ?? 'Untitled school year'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              View saved club sessions and roster results for this school year.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {isActiveYear ? (
              <StatusBadge label="Current year" tone="blue" />
            ) : hasSavedResults ? (
              <StatusBadge label="Saved" tone="green" />
            ) : (
              <StatusBadge label="Past year" tone="slate" />
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
        <div className="font-semibold">Read-only view</div>
        <p className="mt-1 text-sm">
          This page is for reference. Make current-year changes from the regular admin pages.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Year summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatDate(schoolYear.created_at)}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Status
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {isActiveYear ? (
                  <StatusBadge label="Current year" tone="blue" />
                ) : (
                  <StatusBadge label="Saved for reference" tone="slate" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Sessions" value={blockRows.length} />
        <Metric
          label="Finalized sessions"
          value={finalizedBlocks.length}
          tone={finalizedBlocks.length > 0 ? 'green' : 'slate'}
        />
        <Metric label="Students" value={studentRows.length} />
        <Metric label="Clubs" value={totalClubOfferingsForYear} />
        <Metric
          label="Student choices"
          value={totalLatestSubmissionsForYear}
          detail="Latest only"
        />
        <Metric
          label="Final roster spots"
          value={totalFinalAssignmentsForYear}
          tone={totalFinalAssignmentsForYear > 0 ? 'green' : 'slate'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Club sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {blockRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No club sessions were found for this school year.
            </div>
          ) : (
            <div className="space-y-3">
              {blockRows.map((block) => {
                const blockClubs = clubsByBlockId.get(block.id) ?? [];
                const blockFinals = finalsByBlockId.get(block.id) ?? [];
                const blockSnapshots = snapshotsByBlockId.get(block.id) ?? [];
                const blockRuns = matchRunsByBlockId.get(block.id) ?? [];
                const blockSubmissions = submissionsByBlockId.get(block.id) ?? [];
                const blockOverrides = overridesByBlockId.get(block.id) ?? [];
                const blockBelowMinDecisions = belowMinimumDecisionsByBlockId.get(block.id) ?? [];

                const isBlockFinalized =
                  block.status === 'finalized' || Boolean(block.finalized_at);

                const latestRun = [...blockRuns].sort((a, b) => {
                  const aTime = new Date(a.completed_at ?? '1900-01-01').getTime();
                  const bTime = new Date(b.completed_at ?? '1900-01-01').getTime();
                  return bTime - aTime;
                })[0];

                return (
                  <div key={block.id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-slate-900">
                            {block.label ?? 'Untitled session'}
                          </h2>
                          <BlockStatusBadges block={block} />
                        </div>

                        <div className="mt-2 text-sm text-slate-600">
                          Finalized: {formatDateTime(block.finalized_at)}
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          Last matching run:{' '}
                          {latestRun
                            ? `${latestRun.status ?? 'unknown'} · ${formatDateTime(latestRun.completed_at)}`
                            : 'None found'}
                        </div>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                          <Metric label="Clubs" value={blockClubs.length} />
                          <Metric label="Student choices" value={blockSubmissions.length} />
                          <Metric
                            label="Final roster spots"
                            value={blockFinals.length}
                            tone={blockFinals.length > 0 ? 'green' : 'slate'}
                          />
                          <Metric
                            label="Saved results"
                            value={blockSnapshots.length}
                            tone={blockSnapshots.length > 0 ? 'green' : 'slate'}
                          />
                        </div>

                        <details className="mt-3 text-sm text-slate-600">
                          <summary className="cursor-pointer font-medium text-slate-700">
                            Show admin details
                          </summary>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <div>Roster changes: <span className="font-medium">{blockOverrides.length}</span></div>
                            <div>Small-club decisions: <span className="font-medium">{blockBelowMinDecisions.length}</span></div>
                          </div>
                        </details>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={`/admin/archive/${schoolYear.id}/blocks/${block.id}`}
                          className="rounded-xl border bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                        >
                          View session
                        </Link>

                        <Link
                          href={`/admin/archive/${schoolYear.id}/blocks/${block.id}/reports`}
                          className="rounded-xl border bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                        >
                          View reports
                        </Link>

                        {isActiveYear && !isBlockFinalized ? (
                          <Link
                            href="/admin/review"
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 hover:bg-blue-100"
                          >
                            Finalize rosters
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {!isActiveYear ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-950">Delete options</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="mb-3 text-sm text-red-900">
              Review what would be deleted before permanently deleting this saved school year.
            </p>

            <Link
              href={`/admin/archive/${schoolYear.id}/danger-zone`}
              className="inline-flex rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
            >
              View delete options
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
