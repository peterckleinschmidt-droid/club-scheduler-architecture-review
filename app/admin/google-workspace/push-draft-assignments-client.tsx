'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { pushDraftAssignmentsToGoogle } from './push-draft-assignments-actions';

type Result = {
  ok: boolean;
  message: string;
  writtenCount?: number;
  skippedCount?: number;
  noClubCount?: number;
  needsMoreClubsCount?: number;
  workbookUrl?: string;
  alreadySent?: boolean;
};

export default function PushDraftAssignmentsClient() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function sendDrafts() {
    setResult(null);
    startTransition(async () => {
      const next = await pushDraftAssignmentsToGoogle();
      setResult(next);
      if (next.ok) router.refresh();
    });
  }

  if (result?.ok) {
    return (
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <div className="font-semibold">{result.alreadySent ? 'Draft rosters verified in Google' : 'Draft rosters ready in Google'}</div>
        <p className="mt-1 text-sm">{result.message}</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          <li>{result.writtenCount ?? 0} roster assignments sent</li>
          {(result.noClubCount ?? 0) > 0 ? <li>{result.noClubCount} students have no club</li> : null}
          {(result.needsMoreClubsCount ?? 0) > 0 ? <li>{result.needsMoreClubsCount} students received fewer clubs than requested</li> : null}
        </ul>
        <p className="mt-3 text-sm">Open the workbook and Google Workflow. Prepare the roster editor, review the named rosters, make any changes, and validate them.</p>
        {result.workbookUrl ? (
          <a href={result.workbookUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Open roster review in Google
          </a>
        ) : (
          <button type="button" onClick={() => router.refresh()} className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Refresh Workflow
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <button type="button" disabled={pending} onClick={sendDrafts} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Sending draft rosters...' : 'Send draft rosters to Google'}
      </button>
      {result ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{result.message}</div> : null}
    </div>
  );
}
