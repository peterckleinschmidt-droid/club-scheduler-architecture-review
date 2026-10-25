'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncFinalRostersFromGoogle } from './sync-final-rosters-actions';

type Result = { ok:boolean; message:string; importedCount?:number; skippedCount?:number; issueCount?:number };

export default function SyncFinalRostersClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function saveFinals() {
    setResult(null);
    startTransition(async () => {
      const next = await syncFinalRostersFromGoogle();
      setResult(next);
      if (next.ok) router.refresh();
    });
  }

  if (result?.ok) {
    const count = result.importedCount ?? 0;
    return (
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <div className="font-semibold">Reviewed rosters saved in Scheduler</div>
        <p className="mt-1 text-sm">{result.message}</p>
        <p className="mt-2 text-sm">{count} reviewed {count === 1 ? 'assignment is' : 'assignments are'} saved. Create and inspect the printable rosters before finalizing the session.</p>
        <button type="button" onClick={() => router.push('/admin/workflow')} className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          Continue final check
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button type="button" disabled={pending} onClick={saveFinals} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Importing reviewed rosters...' : 'Import reviewed rosters from Google'}
      </button>
      {result ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{result.message}</div> : null}
    </div>
  );
}
