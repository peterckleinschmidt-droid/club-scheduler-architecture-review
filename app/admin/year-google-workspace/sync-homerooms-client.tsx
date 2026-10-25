'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { syncHomeroomsToYearGoogle } from './sync-homerooms-actions';

type SyncHomeroomsResult = { ok: boolean; message: string; homeroomCount?: number };

export default function SyncHomeroomsClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncHomeroomsResult | null>(null);

  function syncHomerooms() {
    setResult(null);
    startTransition(async () => {
      const nextResult = await syncHomeroomsToYearGoogle();
      setResult(nextResult);
      if (nextResult.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={syncHomerooms} disabled={isPending} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
        {isPending ? 'Confirming homerooms...' : 'Confirm and update Google homerooms'}
      </button>
      {result ? (
        <div className={`rounded-xl border p-4 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
          <p className="font-medium">{result.message}</p>
          {result.homeroomCount !== undefined ? <p className="mt-3">Homerooms updated: {result.homeroomCount}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
