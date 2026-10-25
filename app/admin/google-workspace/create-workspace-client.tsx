'use client';

import { createElement, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createGoogleWorkspaceForCurrentBlock } from './actions';

type WorkspaceResult = {
  ok: boolean;
  message: string;
  workbookUrl?: string;
  folderUrl?: string;
};

function FileLink({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  return createElement('a', {
    href,
    target: '_blank',
    rel: 'noreferrer',
    className: primary
      ? 'inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
      : 'inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50',
  }, label);
}

export default function CreateWorkspaceClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<WorkspaceResult | null>(null);

  function createWorkspace() {
    setResult(null);
    startTransition(async () => setResult(await createGoogleWorkspaceForCurrentBlock()));
  }

  if (result?.ok) {
    return (
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
        <div className="font-semibold">Google workspace ready</div>
        <p className="mt-1 text-sm">{result.message}</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Open the session workbook.</li>
          <li>Reload it if the Club Scheduler menu is not visible.</li>
          <li>Approve Google access the first time you use the menu.</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {result.workbookUrl ? <FileLink href={result.workbookUrl} label="Open session workbook" primary /> : null}
          {result.folderUrl ? <FileLink href={result.folderUrl} label="Open Drive folder" /> : null}
          <button type="button" onClick={() => router.refresh()} className="rounded-lg bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Continue to student form</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <button type="button" onClick={createWorkspace} disabled={isPending} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
        {isPending ? 'Preparing Google workspace...' : 'Prepare Google workspace'}
      </button>
      {result ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{result.message}</div> : null}
    </div>
  );
}
