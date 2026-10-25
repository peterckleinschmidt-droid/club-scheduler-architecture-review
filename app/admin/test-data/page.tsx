
import { requireRole, getActiveContext } from '@/lib/auth';
import TestDataClient from './test-data-client';

export default async function TestDataPage() {
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();
  const enabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_DATA_SEED === 'true';

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Test data</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Seed a medium-size test fixture for checking homerooms, clubs, coded choices, matching,
          draft rosters, Google review tabs, and final roster sync.
        </p>
        {year && block ? (
          <p className="mt-1 text-sm text-slate-500">
            Current setup: {year.label} / {block.label}
          </p>
        ) : null}
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Test data seeding is disabled in production unless ENABLE_TEST_DATA_SEED=true.
        </div>
      ) : null}

      {!year || !block ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Set an active school year and block before seeding test data.
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Medium realistic fixture</h2>
        <p className="mt-2 text-sm text-slate-700">
          This creates six test homerooms, twelve clubs, sixty coded students in Google, and sixty
          coded choice rows in the active block workbook. The data is designed to create popular
          clubs, low-interest clubs, capacity pressure, and students who may need roster review.
        </p>

        <div className="mt-4">
          {enabled && year && block ? <TestDataClient /> : null}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Simulated coded student choices</h2>
        <p className="mt-2 text-sm text-slate-700">
          Use <strong>Simulate coded student choices</strong> after seeding students and clubs to
          write realistic ratings directly to <code>Coded Choices Export</code>. This is intended
          for testing Scheduler import, matching, Google roster review, final sync, and printable
          roster generation. It does not create Google Form responses and does not simulate
          verified student email identities.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Suggested test flow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>For a completely fresh test, reset the Google test workspace.</li>
          <li>Create the new block workspace. The year workspace is preserved.</li>
          <li>Return here and seed the medium test data into the new block workbook.</li>
          <li>Use Simulate coded student choices for a fast matching and roster workflow test.</li>
          <li>For a smaller form-parser test, create the student Google Form, submit one or two real responses, and update imported choices.</li>
          <li>Run matching and send draft rosters to Google.</li>
          <li>Review and edit final named rosters in the block workbook.</li>
          <li>Save final rosters back to Scheduler.</li>
        </ol>
      </section>
    </main>
  );
}
