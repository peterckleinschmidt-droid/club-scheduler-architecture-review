"use client";

import { useState, useTransition } from 'react';
import { connectExistingGoogleFormToWorkbook } from './actions';

type Result = {
  ok: boolean;
  message: string;
  workbookUrl?: string;
};

export default function ConnectExistingFormResponsesClient() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  function connectResponses() {
    startTransition(async () => {
      const response = await connectExistingGoogleFormToWorkbook();
      setResult(response);
    });
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={connectResponses}
        disabled={isPending}
        className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Preparing response connection...' : 'Connect form responses'}
      </button>

      {result ? (
        <div
          className={
            result.ok
              ? 'rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950'
              : 'rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950'
          }
        >
          <p>{result.message}</p>
          {result.ok && result.workbookUrl ? (
            <a
              href={result.workbookUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex font-medium underline"
            >
              Open session workbook
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
