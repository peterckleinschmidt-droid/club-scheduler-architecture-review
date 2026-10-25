'use client';

import { useState, useTransition } from 'react';
import {
  clearMediumTestData,
  fullWipeActiveBlockAndSeedMediumTestData,
  hardResetAndSeedMediumTestData,
  resetGoogleTestWorkspace,
  seedMediumTestData,
  simulateCodedStudentChoices,
  type TestDataResult,
} from './actions';

export default function TestDataClient() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TestDataResult | null>(null);

  function run(action: () => Promise<TestDataResult>) {
    setResult(null);
    startTransition(async () => {
      const nextResult = await action();
      setResult(nextResult);
    });
  }

  function seed() {
    run(seedMediumTestData);
  }
  function simulateChoices() {
    const confirmed = window.confirm(
      'Replace the current Coded Choices Export with simulated student choices? This does not create Google Form responses or fake verified student emails.'
    );
    if (!confirmed) return;
    run(simulateCodedStudentChoices);
  }

  function resetGoogleWorkspace() {
    const confirmed = window.confirm(
      'RESET the Google test workspace for the active block? This moves the current student form, block workbook, and block folder to Google Drive trash; clears the saved block workspace links; and removes current block workflow test data. The year workspace and year Student Map are preserved. You must create a new block workspace before seeding again.'
    );

    if (!confirmed) return;
    run(resetGoogleTestWorkspace);
  }

  function fullWipeAndSeed() {
    const confirmed = window.confirm(
      'FULL WIPE the active test block and seed fresh medium test data? This clears ALL student choices, matching runs, draft rosters, final rosters, review decisions, and history for the current block. It does not replace the current Google block workbook. Use Reset Google test workspace for a completely fresh Google workspace.'
    );

    if (!confirmed) return;
    run(fullWipeActiveBlockAndSeedMediumTestData);
  }

  function hardReset() {
    const confirmed = window.confirm(
      'Hard reset the active test block, then seed fresh medium test data? This clears imported test choices, matching runs, review decisions, draft rosters, final rosters, history snapshots, and fixture clubs. It keeps the current Google block workbook.'
    );

    if (!confirmed) return;
    run(hardResetAndSeedMediumTestData);
  }

  function clear() {
    const confirmed = window.confirm(
      'Clear the medium test fixture data for this active block? This removes only records marked as test fixture data.'
    );

    if (!confirmed) return;
    run(clearMediumTestData);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-red-300 bg-red-50 p-4">
        <h3 className="font-semibold text-red-950">Start with a completely new Google test workspace</h3>
        <p className="mt-1 text-sm text-red-900">
          Use this when stale forms, workbooks, or response sheets make testing unreliable. It preserves the year workspace but removes the current block's Google workspace and workflow data.
        </p>
        <button
          type="button"
          onClick={resetGoogleWorkspace}
          disabled={isPending}
          className="mt-3 rounded-md border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Working...' : 'Reset Google test workspace'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={seed}
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Working...' : 'Seed medium test data'}
        </button>

        <button
          type="button"
          onClick={simulateChoices}
          disabled={isPending}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-950 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Working...' : 'Simulate coded student choices'}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Clear medium test data
        </button>

        <button
          type="button"
          onClick={hardReset}
          disabled={isPending}
          className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Hard reset and seed
        </button>

        <button
          type="button"
          onClick={fullWipeAndSeed}
          disabled={isPending}
          className="rounded-md border border-red-500 bg-red-100 px-4 py-2 text-sm font-semibold text-red-950 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Full wipe block and seed
        </button>
      </div>

      {result ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="font-medium">{result.message}</div>

          {result.ok && !result.googleWorkspaceReset ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {result.homeroomCount !== undefined ? <li>Homerooms: {result.homeroomCount}</li> : null}
              {result.clubCount !== undefined ? <li>Clubs: {result.clubCount}</li> : null}
              {result.studentCount !== undefined ? <li>Students in Google Student Map: {result.studentCount}</li> : null}
              {result.choiceCount !== undefined ? <li>Coded choices in block workbook: {result.choiceCount}</li> : null}
              {result.simulatedChoiceCount !== undefined ? <li>Simulated choice rows: {result.simulatedChoiceCount}</li> : null}
              <li>Google updated: {result.googleUpdated ? 'Yes' : 'No'}</li>
            </ul>
          ) : null}

          {result.ok && result.googleWorkspaceReset ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5">
              <li>Create the new block workspace.</li>
              <li>Return here and seed medium test data.</li>
              <li>Create the new Google Form.</li>
              <li>Connect form responses in the new block workbook.</li>
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
