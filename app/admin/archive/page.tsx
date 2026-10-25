import Link from 'next/link';
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

export default async function ArchiveIndexPage() {
  const supabase = await createClient();
  const { year: activeYear } = await getActiveContext();

  const [
    { data: schoolYearsData = [] },
    { data: blocksData = [] },
    { data: studentsData = [] },
    { data: clubOfferingsData = [] },
    { data: finalAssignmentsData = [] },
    { data: historySnapshotsData = [] },
  ] = await Promise.all([
    supabase
      .from('school_years')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase.from('blocks').select('id, school_year_id, status, finalized_at'),
    supabase.from('students').select('id, school_year_id'),
    supabase.from('club_offerings').select('id, block_id'),
    supabase.from('final_assignments').select('id, block_id'),
    supabase
      .from('history_snapshots')
      .select('id, school_year_id, block_id, committed_at'),
  ]);

  const schoolYearRows = (schoolYearsData ?? []) as any[];
  const blockRows = (blocksData ?? []) as any[];
  const studentRows = (studentsData ?? []) as any[];
  const clubOfferingRows = (clubOfferingsData ?? []) as any[];
  const finalAssignmentRows = (finalAssignmentsData ?? []) as any[];
  const historySnapshotRows = (historySnapshotsData ?? []) as any[];

  const activeYearId = activeYear?.id ?? null;

  const blocksByYearId = new Map<string, any[]>();
  const studentsByYearId = new Map<string, any[]>();
  const snapshotsByYearId = new Map<string, any[]>();
  const clubsByYearId = new Map<string, any[]>();
  const finalsByYearId = new Map<string, any[]>();
  const yearIdByBlockId = new Map<string, string>();

  for (const block of blockRows) {
    if (!block.school_year_id) continue;

    yearIdByBlockId.set(block.id, block.school_year_id);

    const rows = blocksByYearId.get(block.school_year_id) ?? [];
    rows.push(block);
    blocksByYearId.set(block.school_year_id, rows);
  }

  for (const student of studentRows) {
    if (!student.school_year_id) continue;

    const rows = studentsByYearId.get(student.school_year_id) ?? [];
    rows.push(student);
    studentsByYearId.set(student.school_year_id, rows);
  }

  for (const snapshot of historySnapshotRows) {
    if (!snapshot.school_year_id) continue;

    const rows = snapshotsByYearId.get(snapshot.school_year_id) ?? [];
    rows.push(snapshot);
    snapshotsByYearId.set(snapshot.school_year_id, rows);
  }

  for (const club of clubOfferingRows) {
    const yearId = yearIdByBlockId.get(club.block_id);
    if (!yearId) continue;

    const rows = clubsByYearId.get(yearId) ?? [];
    rows.push(club);
    clubsByYearId.set(yearId, rows);
  }

  for (const assignment of finalAssignmentRows) {
    const yearId = yearIdByBlockId.get(assignment.block_id);
    if (!yearId) continue;

    const rows = finalsByYearId.get(yearId) ?? [];
    rows.push(assignment);
    finalsByYearId.set(yearId, rows);
  }

  const totalYears = schoolYearRows.length;
  const pastYears = schoolYearRows.filter((year) => year.id !== activeYearId).length;
  const totalBlocks = blockRows.length;
  const finalizedBlocks = blockRows.filter(
    (block) => block.status === 'finalized' || Boolean(block.finalized_at)
  ).length;
  const totalSnapshots = historySnapshotRows.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Past Years</h1>
        <p className="mt-1 text-sm text-slate-600">
          View saved club sessions and past roster results.
        </p>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
        <div className="font-semibold">Saved for reference</div>
        <p className="mt-1 text-sm">
          Past years are for review only. Make current-year changes from the regular admin pages.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric label="School years" value={totalYears} />
        <Metric label="Past years" value={pastYears} />
        <Metric label="Club sessions" value={totalBlocks} />
        <Metric
          label="Finalized sessions"
          value={finalizedBlocks}
          tone={finalizedBlocks > 0 ? 'green' : 'slate'}
        />
        <Metric
          label="Saved results"
          value={totalSnapshots}
          tone={totalSnapshots > 0 ? 'green' : 'slate'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>School years</CardTitle>
        </CardHeader>
        <CardContent>
          {schoolYearRows.length === 0 ? (
            <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
              No school years were found.
            </div>
          ) : (
            <div className="space-y-3">
              {schoolYearRows.map((schoolYear) => {
                const yearBlocks = blocksByYearId.get(schoolYear.id) ?? [];
                const yearStudents = studentsByYearId.get(schoolYear.id) ?? [];
                const yearClubs = clubsByYearId.get(schoolYear.id) ?? [];
                const yearFinals = finalsByYearId.get(schoolYear.id) ?? [];
                const yearSnapshots = snapshotsByYearId.get(schoolYear.id) ?? [];

                const isActiveYear = schoolYear.id === activeYearId;
                const finalizedBlockCount = yearBlocks.filter(
                  (block) => block.status === 'finalized' || Boolean(block.finalized_at)
                ).length;
                const latestSnapshot = [...yearSnapshots].sort((a, b) => {
                  const aTime = new Date(a.committed_at ?? '1900-01-01').getTime();
                  const bTime = new Date(b.committed_at ?? '1900-01-01').getTime();
                  return bTime - aTime;
                })[0];

                const hasSavedResults = yearSnapshots.length > 0 || finalizedBlockCount > 0;

                return (
                  <div key={schoolYear.id} className="rounded-2xl border bg-white p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-slate-900">
                            {schoolYear.label ?? 'Untitled school year'}
                          </h2>

                          {isActiveYear ? (
                            <StatusBadge label="Current year" tone="blue" />
                          ) : hasSavedResults ? (
                            <StatusBadge label="Saved" tone="green" />
                          ) : (
                            <StatusBadge label="Past year" tone="slate" />
                          )}
                        </div>

                        <div className="mt-2 text-sm text-slate-600">
                          Created: {formatDate(schoolYear.created_at)}
                        </div>

                        <div className="mt-1 text-sm text-slate-600">
                          Last saved result:{' '}
                          {latestSnapshot
                            ? formatDateTime(latestSnapshot.committed_at)
                            : 'None yet'}
                        </div>

                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                          <Metric label="Sessions" value={yearBlocks.length} />
                          <Metric
                            label="Finalized"
                            value={finalizedBlockCount}
                            tone={finalizedBlockCount > 0 ? 'green' : 'slate'}
                          />
                          <Metric label="Students" value={yearStudents.length} />
                          <Metric label="Clubs" value={yearClubs.length} />
                          <Metric
                            label="Saved results"
                            value={yearSnapshots.length}
                            tone={yearSnapshots.length > 0 ? 'green' : 'slate'}
                          />
                        </div>

                        <details className="mt-3 text-sm text-slate-600">
                          <summary className="cursor-pointer font-medium text-slate-700">
                            Show roster count
                          </summary>
                          <div className="mt-2">
                            Saved roster rows: <span className="font-medium">{yearFinals.length}</span>
                          </div>
                        </details>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={`/admin/archive/${schoolYear.id}`}
                          className="rounded-xl border bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                        >
                          View year
                        </Link>

                        {!isActiveYear ? (
                          <Link
                            href={`/admin/archive/${schoolYear.id}/danger-zone`}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100"
                          >
                            Delete options
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
    </div>
  );
}
