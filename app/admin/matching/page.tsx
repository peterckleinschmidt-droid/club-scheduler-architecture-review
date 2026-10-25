import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { runMatch } from './actions';
import { Button } from '@/components/ui/button';

type RunRow = {
  id: string;
  block_id: string;
  run_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  blocks?: {
    label?: string | null;
    is_current?: boolean | null;
  } | null;
};

function formatLocalDateTime(value: string | null) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function runTypeLabel(runType: string | null) {
  if (runType === 'rematch') return 'Rematch';
  return 'Initial match';
}

function RunTypeBadge({ runType }: { runType: string | null }) {
  const isRematch = runType === 'rematch';

  return (
    <span
      className={
        isRematch
          ? 'rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-medium text-purple-900'
          : 'rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900'
      }
    >
      {runTypeLabel(runType)}
    </span>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'completed') {
    return (
      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-900">
        Done
      </span>
    );
  }

  if (status === 'running') {
    return (
      <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-900">
        Running
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-900">
        Needs attention
      </span>
    );
  }

  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
      {status ?? 'Unknown'}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'slate' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';
}) {
  const toneClass =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
        : tone === 'red'
          ? 'border-red-200 bg-red-50 text-red-900'
          : tone === 'blue'
            ? 'border-blue-200 bg-blue-50 text-blue-900'
            : tone === 'purple'
              ? 'border-purple-200 bg-purple-50 text-purple-900'
              : 'border-slate-200 bg-white text-slate-900';

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-sm font-medium opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {detail ? <div className="mt-1 text-sm opacity-80">{detail}</div> : null}
    </div>
  );
}

function StepCard({
  done,
  title,
  detail,
}: {
  done: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-start gap-3">
        <div
          className={
            done
              ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-green-200 bg-green-100 text-sm font-bold text-green-800'
              : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-bold text-slate-500'
          }
        >
          {done ? '✓' : '○'}
        </div>

        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{detail}</div>
        </div>
      </div>
    </div>
  );
}

function ActionLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800'
          : 'inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50'
      }
    >
      {children}
    </Link>
  );
}

export default async function Matching() {
  const s = await createClient();
  const { year, block } = await getActiveContext();

  const { data: runs = [] } = await s
    .from('match_runs')
    .select('*, blocks(label,is_current)')
    .order('started_at', { ascending: false })
    .limit(20);

  const runRows = runs as RunRow[];
  const runIds = runRows.map((run) => run.id);

  const [{ data: assignments = [] }, { data: demandSummaries = [] }] =
    runIds.length
      ? await Promise.all([
          s
            .from('draft_assignments')
            .select('id, match_run_id')
            .in('match_run_id', runIds),

          s
            .from('match_demand_summaries')
            .select('match_run_id, below_minimum, at_capacity')
            .in('match_run_id', runIds),
        ])
      : [{ data: [] }, { data: [] }];

  const assignmentsByRunId = new Map<string, number>();

  for (const assignment of assignments as any[]) {
    assignmentsByRunId.set(
      assignment.match_run_id,
      (assignmentsByRunId.get(assignment.match_run_id) ?? 0) + 1
    );
  }

  const belowMinimumByRunId = new Map<string, number>();
  const atCapacityByRunId = new Map<string, number>();

  for (const summary of demandSummaries as any[]) {
    if (summary.below_minimum) {
      belowMinimumByRunId.set(
        summary.match_run_id,
        (belowMinimumByRunId.get(summary.match_run_id) ?? 0) + 1
      );
    }

    if (summary.at_capacity) {
      atCapacityByRunId.set(
        summary.match_run_id,
        (atCapacityByRunId.get(summary.match_run_id) ?? 0) + 1
      );
    }
  }

  const latestCurrentBlockRun =
    block && runRows.length
      ? runRows.find(
          (run) => run.block_id === block.id && run.status === 'completed'
        )
      : null;

  const latestRun = runRows[0] ?? null;

  const latestAssignments = latestCurrentBlockRun
    ? assignmentsByRunId.get(latestCurrentBlockRun.id) ?? 0
    : 0;

  const latestSmallClubs = latestCurrentBlockRun
    ? belowMinimumByRunId.get(latestCurrentBlockRun.id) ?? 0
    : 0;

  const latestFullClubs = latestCurrentBlockRun
    ? atCapacityByRunId.get(latestCurrentBlockRun.id) ?? 0
    : 0;

  const hasActiveBlock = Boolean(year && block);
  const hasCompletedRun = Boolean(latestCurrentBlockRun);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Create draft rosters
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Use student choices to create draft club rosters.
          </p>

          {year && block ? (
            <p className="mt-1 text-sm text-slate-500">
              Current session:{' '}
              <span className="font-medium text-slate-700">
                {year.label} / {block.label}
              </span>
            </p>
          ) : null}
        </div>

        {hasCompletedRun ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-900">
            Draft rosters created
          </span>
        ) : (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-900">
            Ready for matching
          </span>
        )}
      </div>

      {!hasActiveBlock ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-950">
          Choose a school year and current session before running matching.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border bg-white p-4">
          <div>
            <h2 className="text-lg font-semibold">Before creating rosters</h2>
            <p className="mt-1 text-sm text-slate-600">
              Matching uses the current clubs and student choices to create
              draft rosters.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            <StepCard
              done={hasActiveBlock}
              title="Current session is selected"
              detail={
                year && block
                  ? `${year.label} / ${block.label}`
                  : 'Choose the session you want to work on.'
              }
            />

            <StepCard
              done={hasActiveBlock}
              title="Club and student choices are ready"
              detail="Use this after clubs and student choices have been reviewed."
            />

            <StepCard
              done={hasCompletedRun}
              title="Draft rosters"
              detail={
                hasCompletedRun
                  ? `Created ${formatLocalDateTime(
                      latestCurrentBlockRun?.completed_at ??
                        latestCurrentBlockRun?.started_at ??
                        null
                    )}.`
                  : 'Not created yet for this session.'
              }
            />
          </div>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
          <div>
            <h2 className="text-lg font-semibold">Create draft rosters</h2>
            <p className="mt-1 text-sm">
              This will run matching for the current session. You can review and
              adjust the draft rosters before finalizing.
            </p>
          </div>

          <form action={runMatch} className="mt-4">
            <Button type="submit" disabled={!hasActiveBlock}>
              {hasCompletedRun ? 'Create a new draft' : 'Create draft rosters'}
            </Button>
          </form>

          {hasCompletedRun ? (
            <p className="mt-3 text-xs text-blue-900">
              Creating a new draft replaces the current matching result. Review the new rosters after
              it finishes.
            </p>
          ) : null}
        </section>
      </div>

      {latestCurrentBlockRun ? (
        <section className="space-y-4">
          <div className="rounded-2xl border bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Latest draft rosters</h2>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RunTypeBadge runType={latestCurrentBlockRun.run_type} />
                  <StatusBadge status={latestCurrentBlockRun.status} />
                  <span className="text-sm text-slate-600">
                    Created{' '}
                    {formatLocalDateTime(
                      latestCurrentBlockRun.completed_at ??
                        latestCurrentBlockRun.started_at
                    )}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <ActionLink href="/admin/review" primary>Review draft rosters</ActionLink>
                <ActionLink href="/admin/workflow">Return to Workflow</ActionLink>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="Draft roster spots"
              value={latestAssignments}
              detail="Students placed into clubs"
              tone="blue"
            />

            <SummaryCard
              label="Small clubs"
              value={latestSmallClubs}
              detail="May need a keep-or-cancel decision"
              tone={latestSmallClubs > 0 ? 'yellow' : 'green'}
            />

            <SummaryCard
              label="Full clubs"
              value={latestFullClubs}
              detail="At capacity after matching"
              tone={latestFullClubs > 0 ? 'purple' : 'green'}
            />
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
          No draft rosters have been created for the current session yet.
        </section>
      )}

      <section className="space-y-3">
        <details className="rounded-2xl border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
            Show previous matching runs
          </summary>

          <div className="border-t">
            {runRows.length === 0 ? (
              <div className="p-4 text-sm text-slate-600">
                No matching runs have been created yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3 font-medium">Session</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Started</th>
                      <th className="px-4 py-3 font-medium">Finished</th>
                      <th className="px-4 py-3 font-medium">Roster spots</th>
                      <th className="px-4 py-3 font-medium">Small clubs</th>
                      <th className="px-4 py-3 font-medium">Full clubs</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y">
                    {runRows.map((run) => {
                      const isLatestForCurrentBlock =
                        latestCurrentBlockRun?.id === run.id;

                      return (
                        <tr key={run.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {run.blocks?.label ?? 'Unknown session'}
                            </div>

                            <div className="mt-1 flex flex-wrap gap-2">
                              {run.blocks?.is_current ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900">
                                  Current session
                                </span>
                              ) : null}

                              {isLatestForCurrentBlock ? (
                                <span className="rounded-full border border-green-200 bg-green-50 px-2 py-1 text-xs font-medium text-green-900">
                                  Latest draft
                                </span>
                              ) : null}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <RunTypeBadge runType={run.run_type} />
                          </td>

                          <td className="px-4 py-3">
                            <StatusBadge status={run.status} />
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {formatLocalDateTime(run.started_at)}
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {formatLocalDateTime(run.completed_at)}
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {assignmentsByRunId.get(run.id) ?? 0}
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {belowMinimumByRunId.get(run.id) ?? 0}
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {atCapacityByRunId.get(run.id) ?? 0}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {latestRun ? (
              <div className="border-t px-4 py-3 text-xs text-slate-500">
                Times are shown in Central time.
              </div>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}