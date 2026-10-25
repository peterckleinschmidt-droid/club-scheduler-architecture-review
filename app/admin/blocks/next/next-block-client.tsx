"use client";

import { useEffect, useState, useTransition } from 'react';
import {
  getNextBlockOverview,
  startNextBlock,
  type NextBlockOverview,
  type StartNextBlockResult,
} from './next-block-actions';

export default function NextBlockClient() {
  const [isPending, startTransition] = useTransition();
  const [overview, setOverview] = useState<NextBlockOverview | null>(null);
  const [label, setLabel] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<StartNextBlockResult | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const next = await getNextBlockOverview();
      setOverview(next);
      setLabel(next.suggestedLabel ?? '');
    });
  }, []);

  function createBlock() {
    setResult(null);
    startTransition(async () => {
      const next = await startNextBlock({ label });
      setResult(next);
      if (next.ok) {
        setOverview(await getNextBlockOverview());
      }
    });
  }

  return (
    <div className="space-y-6">
      {isPending && !overview ? <p className="text-sm text-slate-600">Loading session information...</p> : null}

      {overview && !overview.ok ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {overview.message}
        </div>
      ) : null}

      {overview?.ok ? (
        <>
          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Current school year</h2>
            <p className="mt-2 text-sm text-slate-700">{overview.yearLabel}</p>
            <p className="mt-1 text-sm text-slate-600">
              Current session: {overview.currentBlock?.label ?? 'None'}
            </p>
          </section>

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">1. Create the next session</h2>
            <p className="mt-2 text-sm text-slate-700">
              The previous session, its Google workbook, form, responses, matching results, and final rosters will stay unchanged.
            </p>

            <label className="mt-4 block text-sm font-medium text-slate-900">
              New session name
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="mt-1 block w-full max-w-md rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="mt-4 flex max-w-2xl items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1"
              />
              <span>I understand that the new session will become current, while prior sessions remain available in the archive.</span>
            </label>

            <button
              type="button"
              onClick={createBlock}
              disabled={isPending || !acknowledged || !label.trim()}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? 'Creating...' : 'Create and switch to this session'}
            </button>

            {result ? (
              <div className={`mt-4 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                {result.message}
              </div>
            ) : null}
          </section>

          {result?.ok ? (
            <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <h2 className="text-lg font-semibold text-blue-950">Continue setting up {label}</h2>
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-blue-950">
                <li><a className="font-medium underline" href="/admin/clubs">Copy and review clubs</a>. Copied clubs remain hidden until you publish them.</li>
                <li><a className="font-medium underline" href="/admin/google-workspace">Create the Google session workspace</a>.</li>
                <li><a className="font-medium underline" href="/admin/prepare-form">Create the student form</a> after club setup is complete.</li>
                <li><a className="font-medium underline" href="/admin/workflow">Return to Workflow</a> to collect choices, match students, and review rosters.</li>
              </ol>
            </section>
          ) : null}

          <section className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Sessions already in this year</h2>
            <ul className="mt-3 divide-y rounded-lg border border-slate-200">
              {(overview.blocks ?? []).map((block) => (
                <li key={block.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="font-medium text-slate-900">{block.label}</span>
                  <span className="text-slate-600">{block.isCurrent ? 'Current session' : block.status || 'Saved'}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
