import Link from 'next/link';
import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import ConnectGoogleFormsClient from '../prepare-form/connect-google-client';
import CreateYearWorkspaceClient from './create-year-workspace-client';
import SyncHomeroomsClient from './sync-homerooms-client';

type Workspace = {
  google_year_folder_id: string | null;
  google_year_setup_workbook_id: string | null;
  google_year_setup_workbook_url: string | null;
};

type BlockRow = {
  id: string;
  label: string | null;
  status: string | null;
  finalized_at: string | null;
  is_current: boolean | null;
};

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </div>
  );
}

function Step({
  number,
  title,
  detail,
  state,
  children,
}: {
  number: number;
  title: string;
  detail: string;
  state: 'done' | 'next' | 'waiting';
  children?: React.ReactNode;
}) {
  const marker = state === 'done' ? 'Done' : state === 'next' ? 'Next' : 'Later';
  const tone =
    state === 'done'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : state === 'next'
        ? 'border-blue-300 bg-blue-50 text-blue-950'
        : 'border-slate-200 bg-white text-slate-700';

  return (
    <section className={`rounded-2xl border p-5 ${tone}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20 bg-white text-sm font-bold">
          {number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <span className="rounded-full border border-current/20 bg-white/80 px-2 py-0.5 text-xs font-semibold">
              {marker}
            </span>
          </div>
          <p className="mt-1 text-sm opacity-85">{detail}</p>
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

function ActionLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? 'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
          : 'inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50'
      }
    >
      {children}
    </Link>
  );
}

function ExternalLink({ href, children, primary = false }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? 'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
          : 'inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50'
      }
    >
      {children}
    </a>
  );
}

export default async function SchoolYearPage() {
  await requireRole(['admin']);
  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <p className="text-sm font-semibold text-blue-700">Annual setup</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Start a school year</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Create the school year and its first session, then return here to prepare the year workbook and homerooms.
          </p>
        </div>
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="text-xl font-semibold text-blue-950">No active school year</h2>
          <p className="mt-2 text-sm text-blue-900">
            Use the guided new-year page to create the year and Session 1. Existing saved years remain in Past Years.
          </p>
          <div className="mt-5">
            <ActionLink href="/admin/reset" primary>Start a new school year</ActionLink>
          </div>
        </section>
      </div>
    );
  }

  const [workspaceResult, homeroomResult, studentResult, blocksResult] = await Promise.all([
    admin
      .from('google_year_workspace_links')
      .select('google_year_folder_id, google_year_setup_workbook_id, google_year_setup_workbook_url')
      .eq('school_year_id', year.id)
      .maybeSingle(),
    admin.from('teachers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('students').select('id', { count: 'exact', head: true }).eq('school_year_id', year.id),
    admin
      .from('blocks')
      .select('id, label, status, finalized_at, is_current')
      .eq('school_year_id', year.id),
  ]);

  const workspace = (workspaceResult.data ?? null) as Workspace | null;
  const blocks = (blocksResult.data ?? []) as BlockRow[];
  const homeroomCount = homeroomResult.count ?? 0;
  const studentCount = studentResult.count ?? 0;
  const hasWorkspace = Boolean(workspace?.google_year_setup_workbook_id);
  const hasHomerooms = homeroomCount > 0;
  const hasBlocks = blocks.length > 0;
  const finalizedBlocks = blocks.filter(
    (item) => item.status === 'finalized' || Boolean(item.finalized_at)
  );
  const unfinishedBlocks = blocks.filter(
    (item) => item.status !== 'finalized' && !item.finalized_at
  );
  const yearReady = hasWorkspace && hasHomerooms && hasBlocks;
  const closeReady = blocks.length > 0 && unfinishedBlocks.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-700">School year</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{year.label}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Prepare the annual student and homeroom workspace, manage sessions, and check year-end readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {workspace?.google_year_setup_workbook_url ? (
            <ExternalLink href={workspace.google_year_setup_workbook_url} primary>
              Open year workbook
            </ExternalLink>
          ) : null}
          <ActionLink href="/admin/archive">Past years</ActionLink>
        </div>
      </header>

      {workspaceResult.error || blocksResult.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Some school-year information could not be loaded. {workspaceResult.error?.message ?? blocksResult.error?.message}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Year overview</h2>
            <p className="mt-1 text-sm text-slate-600">
              {yearReady ? 'The annual foundation is ready.' : 'Finish the highlighted setup step below.'}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${yearReady ? 'bg-emerald-100 text-emerald-900' : 'bg-blue-100 text-blue-900'}`}>
            {yearReady ? 'Ready' : 'Setup in progress'}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Homerooms" value={homeroomCount} helper="Active in Scheduler" />
          <Metric label="Coded students" value={studentCount} helper="Current school year" />
          <Metric label="Sessions" value={blocks.length} helper={`${finalizedBlocks.length} completed`} />
          <Metric label="Current session" value={block?.label ?? 'None'} helper="Used by Workflow" />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Annual setup</h2>
          <p className="mt-1 text-sm text-slate-600">Complete these once near the beginning of the school year.</p>
        </div>

        <Step
          number={1}
          title="Prepare the year workbook"
          detail="This workbook keeps the year-level homeroom list and student map inside Google Workspace."
          state={hasWorkspace ? 'done' : 'next'}
        >
          {hasWorkspace ? (
            <div className="flex flex-wrap gap-2">
              {workspace?.google_year_setup_workbook_url ? (
                <ExternalLink href={workspace.google_year_setup_workbook_url} primary>Open year workbook</ExternalLink>
              ) : null}
              {workspace?.google_year_folder_id ? (
                <ExternalLink href={`https://drive.google.com/drive/folders/${workspace.google_year_folder_id}`}>Open year folder</ExternalLink>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <ConnectGoogleFormsClient />
              <CreateYearWorkspaceClient />
            </div>
          )}
        </Step>

        <Step
          number={2}
          title="Review homerooms"
          detail="Add or update the homeroom names used throughout this school year."
          state={hasHomerooms ? 'done' : hasWorkspace ? 'next' : 'waiting'}
        >
          <div className="flex flex-wrap gap-2">
            <ActionLink href="/admin/teachers" primary={!hasHomerooms}>Review homerooms</ActionLink>
            {hasWorkspace && hasHomerooms ? <SyncHomeroomsClient /> : null}
          </div>
        </Step>

        <Step
          number={3}
          title="Start the first or next session"
          detail="Sessions keep each club cycle separate while using the same annual student map and homerooms."
          state={hasBlocks ? 'done' : hasWorkspace && hasHomerooms ? 'next' : 'waiting'}
        >
          <div className="flex flex-wrap gap-2">
            <ActionLink href={hasBlocks ? '/admin/blocks/next' : '/admin/blocks'} primary={!hasBlocks}>
              {hasBlocks ? 'Start another session' : 'Create the first session'}
            </ActionLink>
            <ActionLink href="/admin/blocks">View all sessions</ActionLink>
          </div>
        </Step>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Year-end readiness</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Closing the year preserves completed sessions, reports, fairness history, and Google files. It makes a new year current and locks the old sessions.
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${closeReady ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-950'}`}>
            {closeReady ? 'Ready to close' : `${unfinishedBlocks.length} unfinished`}
          </span>
        </div>

        {unfinishedBlocks.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-semibold text-amber-950">Finish every session before starting the next school year</div>
            <ul className="mt-2 space-y-2 text-sm text-amber-950">
              {unfinishedBlocks.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2">
                  <span>{item.label ?? 'Untitled session'}</span>
                  <ActionLink href="/admin/blocks">Open sessions</ActionLink>
                </li>
              ))}
            </ul>
          </div>
        ) : blocks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">There are no sessions to close yet.</p>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            All {blocks.length} session{blocks.length === 1 ? '' : 's'} are finalized. The guided new-year process can archive this year and create Session 1 for the next year.
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionLink href="/admin/archive">Review saved year data</ActionLink>
          <ActionLink href="/admin/reset" primary={closeReady}>Start the next school year</ActionLink>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The next-school-year page requires an exact confirmation phrase before changing the active year.
        </p>
      </section>

      <details suppressHydrationWarning className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Google maintenance and recovery</summary>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionLink href="/admin/google-workspace">Open session Google tools</ActionLink>
          <ActionLink href="/admin/google-health">Check Google connection</ActionLink>
        </div>
      </details>
    </div>
  );
}
