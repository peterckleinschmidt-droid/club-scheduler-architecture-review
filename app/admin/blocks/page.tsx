import { createClient } from '@/lib/supabase/server';
import { createBlock } from './actions';
import { WorkflowActionButton } from './block-workflow-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function blockSortValue(label: string | null | undefined) {
  const match = String(label ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : -1;
}

function workflowSummary(block: any) {
  if (block.public_club_submission_open) return 'Club setup form open';
  if (block.student_form_open) return 'Student sign-up form open';
  if (block.status === 'matching') return 'Ready for matching';
  if (block.status === 'review') return 'Review rosters';
  if (block.status === 'finalized') return 'Rosters finalized';

  return 'Setup';
}

function workflowTone(block: any) {
  if (block.public_club_submission_open) {
    return 'border-blue-200 bg-blue-50 text-blue-900';
  }

  if (block.student_form_open) {
    return 'border-green-200 bg-green-50 text-green-900';
  }

  if (block.status === 'matching') {
    return 'border-purple-200 bg-purple-50 text-purple-900';
  }

  if (block.status === 'finalized') {
    return 'border-slate-300 bg-slate-100 text-slate-900';
  }

  return 'border-yellow-200 bg-yellow-50 text-yellow-900';
}

function nextStepText(block: any) {
  if (block.public_club_submission_open) {
    return 'Staff can submit club ideas now. When clubs are ready, open student choices.';
  }

  if (block.student_form_open) {
    return 'Students can choose clubs now. When choices are complete, close forms and run matching.';
  }

  if (block.status === 'matching') {
    return 'Forms are closed. This session is ready for matching.';
  }

  if (block.status === 'review') {
    return 'Draft rosters are ready to review.';
  }

  if (block.status === 'finalized') {
    return 'Rosters are finalized. Use Reports to review results.';
  }

  return 'Start by opening club sign-up, or make this the current session if you are preparing it.';
}

function StatusBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-sm font-medium ${className}`}
    >
      {children}
    </span>
  );
}

function LinkPanel({
  title,
  value,
  helpText,
}: {
  title: string;
  value: string;
  helpText: string;
}) {
  return (
    <details className="rounded-xl bg-slate-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-900">
        {title}
      </summary>
      <div className="mt-3 space-y-2">
        <Input value={value} readOnly />
        <p className="text-sm text-slate-500">{helpText}</p>
      </div>
    </details>
  );
}

function WorkflowButtons({ block }: { block: any }) {
  const clubFormOpen = Boolean(block.public_club_submission_open);
  const studentFormOpen = Boolean(block.student_form_open);
  const anyFormOpen = clubFormOpen || studentFormOpen;

  return (
    <div className="flex flex-wrap gap-2">
      <WorkflowActionButton
        blockId={block.id}
        actionType="make-current"
        label={block.is_current ? 'Current session' : 'Make current'}
        disabled={Boolean(block.is_current)}
      />

      <WorkflowActionButton
        blockId={block.id}
        actionType="open-club-intake"
        label={clubFormOpen ? 'Club setup form is open' : 'Open club setup form'}
        disabled={clubFormOpen}
      />

      <WorkflowActionButton
        blockId={block.id}
        actionType="open-student-form"
        label={
          studentFormOpen
            ? 'Student sign-up form is open'
            : 'Open student sign-up form'
        }
        disabled={studentFormOpen}
      />

      <WorkflowActionButton
        blockId={block.id}
        actionType="close-forms"
        label={anyFormOpen ? 'Close forms for matching' : 'Forms are closed'}
        disabled={!anyFormOpen}
      />
    </div>
  );
}

function BlockCard({
  block,
  baseUrl,
  emphasized = false,
}: {
  block: any;
  baseUrl: string;
  emphasized?: boolean;
}) {
  const studentLink = `${baseUrl}/student/block/${block.id}`;
  const publicClubLink = `${baseUrl}/club-offerings/block/${block.id}/submit?token=${block.public_club_submission_token}`;

  return (
    <div
      className={
        emphasized
          ? 'space-y-4 rounded-2xl border-2 border-blue-300 bg-white p-5 shadow-sm'
          : 'space-y-4 rounded-2xl border bg-white p-4'
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className={emphasized ? 'text-2xl font-bold' : 'text-xl font-semibold'}>
          {block.label ?? 'Untitled session'}
        </h2>

        {block.is_current ? (
          <StatusBadge className="border-blue-200 bg-blue-100 text-blue-900">
            Current session
          </StatusBadge>
        ) : null}

        <StatusBadge className={workflowTone(block)}>
          {workflowSummary(block)}
        </StatusBadge>
      </div>

      <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
        {nextStepText(block)}
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-medium text-slate-900">Next actions</div>
        <WorkflowButtons block={block} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LinkPanel
          title="Club sign-up link"
          value={publicClubLink}
          helpText="Share this with staff when club sign-up is open."
        />

        <LinkPanel
          title="Student choices link"
          value={studentLink}
          helpText="Use this for testing or a session-specific student link."
        />
      </div>
    </div>
  );
}

export default async function BlocksPage() {
  const supabase = await createClient();

  const { data: activeYear } = await supabase
    .from('school_years')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  const { data: blocksData = [] } = activeYear
    ? await supabase
        .from('blocks')
        .select('*')
        .eq('school_year_id', activeYear.id)
    : { data: [] };

  const blockRows = (blocksData ?? []) as any[];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const sortedBlocks = [...blockRows].sort((a: any, b: any) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;

    const aVal = blockSortValue(a.label);
    const bVal = blockSortValue(b.label);

    if (aVal !== bVal) return bVal - aVal;

    return String(b.label ?? '').localeCompare(String(a.label ?? ''));
  });

  const currentBlock = sortedBlocks.find((block: any) => block.is_current);
  const otherBlocks = sortedBlocks.filter((block: any) => !block.is_current);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Club Sessions</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Create club sessions and choose which one you are working on.
        </p>

        {activeYear ? (
          <p className="mt-1 text-sm text-slate-500">
            School year:{' '}
            <span className="font-medium text-slate-700">{activeYear.label}</span>
          </p>
        ) : null}
      </div>

      {!activeYear ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-900">
          No active school year is configured yet.
        </div>
      ) : null}

      {activeYear ? (
        <div className="rounded-2xl border bg-white p-4">
          <h2 className="mb-3 text-lg font-semibold">Add club session</h2>

          <form action={createBlock} className="flex flex-col gap-2 md:flex-row">
            <Input name="label" placeholder="Example: Winter Clubs" required />
            <Button type="submit">Add session</Button>
          </form>

          <p className="mt-2 text-sm text-slate-500">
            New sessions become current automatically.
          </p>
        </div>
      ) : null}

      {activeYear && sortedBlocks.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-slate-600">
          No club sessions exist yet for this school year.
        </div>
      ) : null}

      {activeYear && sortedBlocks.length > 0 ? (
        <div className="space-y-6">
          {currentBlock ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Current session</h2>
                <p className="mt-1 text-sm text-slate-600">
                  This is the session used by club sign-up, student choices,
                  matching, review, and reports.
                </p>
              </div>

              <BlockCard block={currentBlock} baseUrl={baseUrl} emphasized />
            </section>
          ) : (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
              No current session is set. Choose a session below and make it current.
            </div>
          )}

          {otherBlocks.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Other sessions</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Older or upcoming sessions for this school year.
                </p>
              </div>

              <div className="space-y-4">
                {otherBlocks.map((block: any) => (
                  <BlockCard key={block.id} block={block} baseUrl={baseUrl} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
