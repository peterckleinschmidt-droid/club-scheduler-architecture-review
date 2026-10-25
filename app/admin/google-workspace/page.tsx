import { createElement, type ReactNode } from 'react';
import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import ConnectGoogleFormsClient from '../prepare-form/connect-google-client';
import CreateWorkspaceClient from './create-workspace-client';
import SyncCodedChoicesClient from './sync-coded-choices-client';
import PushDraftAssignmentsClient from './push-draft-assignments-client';
import SyncFinalRostersClient from './sync-final-rosters-client';
import FinalizeBlockClient from './finalize-block-client';

type GoogleWorkspaceLink = {
  google_block_folder_id: string | null;
  google_setup_workbook_id: string | null;
  google_setup_workbook_url: string | null;
};

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ExternalLink({
  href,
  label,
  variant,
}: {
  href: string;
  label: string;
  variant: 'primary' | 'secondary';
}) {
  return createElement(
    'a',
    {
      href,
      target: '_blank',
      rel: 'noreferrer',
      className:
        variant === 'primary'
          ? 'inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800'
          : 'inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50',
    },
    label
  );
}

function FileLinks({ workspace }: { workspace: GoogleWorkspaceLink | null }) {
  if (!workspace?.google_setup_workbook_url && !workspace?.google_block_folder_id) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {workspace.google_setup_workbook_url
        ? ExternalLink({
            href: workspace.google_setup_workbook_url,
            label: 'Open workbook',
            variant: 'primary',
          })
        : null}

      {workspace.google_block_folder_id
        ? ExternalLink({
            href: `https://drive.google.com/drive/folders/${workspace.google_block_folder_id}`,
            label: 'Open Drive folder',
            variant: 'secondary',
          })
        : null}
    </div>
  );
}

export default async function GoogleWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(['admin']);

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const googleFormsStatus = resolvedSearchParams.googleForms;

  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Google workspace
        </h1>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          No active school year or current session is configured yet.
        </div>
      </main>
    );
  }

  const { data: workspaceData, error: workspaceError } = await admin
    .from('google_workspace_links')
    .select('google_block_folder_id, google_setup_workbook_id, google_setup_workbook_url')
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  const workspace = (workspaceData ?? null) as GoogleWorkspaceLink | null;
  const hasWorkspace =
    Boolean(workspace?.google_setup_workbook_url) || Boolean(workspace?.google_block_folder_id);
  const finalAssignmentResult = await admin.from('final_assignments').select('id', { count: 'exact', head: true }).eq('block_id', block.id);
  const hasImportedRosters = (finalAssignmentResult.count ?? 0) > 0;
  const isFinalized = block.status === 'finalized' || Boolean((block as any).finalized_at);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Google workspace
        </h1>

        <p className="mt-2 max-w-3xl text-slate-600">
          Use this page for the Google side of the workflow: create the workbook, import coded choices, send draft rosters for named review, pull reviewed rosters back into Scheduler, and return to the workbook to create printable roster Docs. Identifiable student information stays in Google Workspace.
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Current setup: {year.label} / {block.label}
        </p>
      </div>

      {googleFormsStatus === 'connected' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          Google Drive, Sheets, and Forms are connected. You can create and update the workspace now.
        </div>
      ) : null}

      {googleFormsStatus === 'connection-failed' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Google could not be connected. Try again. If it keeps happening, the district may need to
          approve this app for Drive, Sheets, and Forms access.
        </div>
      ) : null}

      {workspaceError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          Could not load the saved Google workspace links: {workspaceError.message}
        </div>
      ) : null}

      <SectionCard title="Step 1: Connect Google">
        <p className="text-sm text-slate-700">
          Connect Google so Scheduler can create and update the Drive folder, workbook, student
          form, and coded sync tabs in your Google account.
        </p>

        <ConnectGoogleFormsClient />
      </SectionCard>

      <SectionCard title="Step 2: Create the workspace">
        <p className="text-sm text-slate-700">
          This creates a Drive folder and a workbook for this session. The workbook includes tabs for
          the student map, coded choices, draft assignments, final rosters, and printable roster
          outputs.
        </p>

        <CreateWorkspaceClient />
      </SectionCard>

      <SectionCard title="Current workspace">
        {hasWorkspace ? (
          <>
            <p className="text-sm text-slate-700">
              A Google workspace is already saved for this session.
            </p>

            <FileLinks workspace={workspace} />
          </>
        ) : (
          <p className="text-sm text-slate-700">
            No Google workspace has been saved for this session yet.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Step 3: Sync coded choices">
        <p className="text-sm text-slate-700">
          Read coded student choices from the Coded Choices Export tab in the Google workbook and
          import them into Scheduler. This tab should not include student names or emails.
        </p>

        {hasWorkspace ? (
          <SyncCodedChoicesClient />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Create the Google workspace first, then sync coded choices from the workbook.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Step 4: Send draft rosters to Google">
        <p className="text-sm text-slate-700">
          After running matching in Scheduler, send the coded draft assignments back to the Google
          workbook. This writes to the Draft Coded Assignments tab and prepares the named roster
          review tabs inside Google.
        </p>

        {hasWorkspace ? (
          <>
            <PushDraftAssignmentsClient />
            <p className="text-xs text-slate-500">Scheduler verifies the latest match run in Google before marking this step complete. A verified delivery will not be overwritten.</p>
          </>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Create the Google workspace first, then send draft rosters to Google.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Step 5: Pull reviewed rosters from Google">
        <p className="text-sm text-slate-700">
          After the coordinator validates rosters in Google Workflow, pull the Final Coded Assignments tab back into Scheduler. This saves the reviewed assignments but keeps the session open for the printable-roster check.
        </p>

        {hasWorkspace ? (
          <SyncFinalRostersClient />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Create the Google workspace first, then pull reviewed rosters from Google.
          </div>
        )}
      </SectionCard>

      <SectionCard title="Step 6: Inspect printable rosters and finalize">
        <p className="text-sm text-slate-700">Create and inspect both printable roster Docs in Google. If a correction is needed, edit, validate, and pull the reviewed rosters again. Finalize only after both documents are ready to distribute.</p>
        {isFinalized ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Session finalized</strong><p className="mt-1">Fairness history is saved and matching is locked.</p></div> : hasImportedRosters ? <FinalizeBlockClient /> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Pull reviewed rosters from Google before finalizing.</div>}
      </SectionCard>
      <SectionCard title="What this workspace is for">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>
            The workbook keeps student names, emails, and homerooms inside Google Workspace.
          </li>
          <li>
            Scheduler reads only coded student choices after the Google sheet prepares them.
          </li>
          <li>
            Scheduler sends coded draft assignments back to Google after matching.
          </li>
          <li>
            The coordinator can make named roster edits in Google.
          </li>
          <li>
            Scheduler reads the final coded assignments back for fairness history.
          </li>
          <li>
            After Scheduler finalizes the session, use the Google Workflow sidebar to create printable club and homeroom roster Docs.
          </li>
        </ol>
      </SectionCard>
    </main>
  );
}
