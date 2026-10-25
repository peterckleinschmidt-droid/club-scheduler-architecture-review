"use client";

import { useState, useTransition } from "react";
import ConnectGoogleFormsClient from "../prepare-form/connect-google-client";
import { checkGoogleHealth, type GoogleHealthResult } from "./actions";

type GoogleHealthClientProps = {
  returnTo?: string;
};

function formatCheckedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "just now";

  return date.toLocaleString();
}

export default function GoogleHealthClient({ returnTo }: GoogleHealthClientProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<GoogleHealthResult | null>(null);

  function runCheck() {
    setResult(null);

    startTransition(async () => {
      const nextResult = await checkGoogleHealth();
      setResult(nextResult);
    });
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Google connection</h2>
          <p className="mt-1 text-sm text-slate-600">
            Check that Scheduler can still reach the Google files for this workflow.
          </p>
        </div>

        <button
          type="button"
          onClick={runCheck}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Checking..." : "Check Google connection"}
        </button>
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-xl border p-4 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-amber-200 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="font-medium">{result.message}</div>
          <div className="mt-1 text-xs">Last checked: {formatCheckedAt(result.checkedAt)}</div>

          {result.details.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {result.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}

          {result.needsReconnect ? (
            <div className="mt-4">
              <ConnectGoogleFormsClient label="Reconnect Google" returnTo={returnTo} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
