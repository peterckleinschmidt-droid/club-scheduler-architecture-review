'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { finalizeImportedRosters } from './sync-final-rosters-actions';

type Result = { ok: boolean; message: string };

export default function FinalizeBlockClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function finalizeBlock() {
    setResult(null);
    startTransition(async () => {
      const next = await finalizeImportedRosters();
      setResult(next);
      if (next.ok) router.refresh();
    });
  }

  return (
    <div className="w-full rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <div className="font-semibold">Ready to close the session?</div>
      <p className="mt-1 text-sm">Finalize only after both printable roster documents look correct. Finalizing closes matching for this session and saves its history for future matching.</p>
      <button type="button" disabled={pending} onClick={finalizeBlock} className="mt-4 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Finalizing session...' : 'Finalize this session'}
      </button>
      {result ? <div className={`mt-3 rounded-lg border p-3 text-sm ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-white text-amber-950'}`}>{result.message}</div> : null}
    </div>
  );
}
