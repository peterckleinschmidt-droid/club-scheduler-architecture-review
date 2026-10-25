'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncCodedChoicesFromGoogle } from './sync-coded-choices-actions';

type SyncResult = {
  ok: boolean;
  message: string;
  importedCount?: number;
  createdStudentCount?: number;
  issueCount?: number;
};

export default function SyncCodedChoicesClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function syncChoices() {
    setResult(null);

    startTransition(async () => {
      const nextResult = await syncCodedChoicesFromGoogle();
      setResult(nextResult);

      if (nextResult.ok) {
        router.refresh();
      }
    });
  }

  if (result?.ok) {
    const importedCount = result.importedCount ?? 0;
    const issueCount = result.issueCount ?? 0;

    return (
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <div className="font-semibold">Student choices imported</div>
        <p className="mt-1 text-sm">{result.message}</p>

        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          <li>
            {importedCount} {importedCount === 1 ? 'student is' : 'students are'} ready for matching
          </li>
          {issueCount > 0 ? (
            <li>
              {issueCount} response {issueCount === 1 ? 'issue needs' : 'issues need'} review
            </li>
          ) : null}
        </ul>

        <button
          type="button"
          onClick={() => router.refresh()}
          className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Continue to matching
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        type="button"
        disabled={isPending}
        onClick={syncChoices}
        className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isPending ? 'Importing student choices...' : 'Import student choices'}
      </button>

      {result ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
