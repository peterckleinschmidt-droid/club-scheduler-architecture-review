
"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ConnectGoogleFormsClient from "@/app/admin/prepare-form/connect-google-client";
import { checkGoogleHealth, type GoogleHealthResult } from "@/app/admin/google-health/actions";

function safeReturnTo(pathname: string, search: string) {
  const path = search ? `${pathname}?${search}` : pathname;

  if (!path.startsWith("/admin")) return "/admin/workflow";
  if (path.startsWith("//")) return "/admin/workflow";

  return path;
}

function healthyDetailText(result: GoogleHealthResult) {
  if (result.yearWorkbookChecked && result.blockWorkbookChecked) {
    return "Google connected. Year and session workbooks are reachable.";
  }

  if (result.yearWorkbookChecked) {
    return "Google connected. Year setup workbook is reachable.";
  }

  return "Google connected.";
}

export default function AdminGoogleHealthStatus() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<GoogleHealthResult | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const checkedPathRef = useRef<string | null>(null);

  const returnTo = useMemo(() => {
    return safeReturnTo(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  function runCheck({ quiet = false }: { quiet?: boolean } = {}) {
    if (!quiet) {
      setResult(null);
    }

    startTransition(async () => {
      const nextResult = await checkGoogleHealth();
      setResult(nextResult);
      setHasChecked(true);
    });
  }

  useEffect(() => {
    if (checkedPathRef.current === returnTo) return;

    checkedPathRef.current = returnTo;
    runCheck({ quiet: true });
  }, [returnTo]);

  if (isPending && !hasChecked) {
    return (
      <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Google connection</div>
        <p className="mt-1 text-sm text-slate-600">Checking Google connection...</p>
      </section>
    );
  }

  if (result?.ok) {
    return (
      <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-medium">Google connection working.</span>{" "}
            <span>{healthyDetailText(result)}</span>
          </div>

          <button
            type="button"
            onClick={() => runCheck()}
            disabled={isPending}
            className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-950 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Checking..." : "Check again"}
          </button>
        </div>
      </section>
    );
  }

  if (result && !result.ok) {
    return (
      <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="font-semibold">Google connection needs attention</div>
            <p className="mt-1">{result.message}</p>
          </div>

          <button
            type="button"
            onClick={() => runCheck()}
            disabled={isPending}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Checking..." : "Check again"}
          </button>
        </div>

        {result.details.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {result.details.slice(0, 3).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

        {result.needsReconnect ? (
          <div className="mt-4">
            <ConnectGoogleFormsClient label="Reconnect Google" returnTo={returnTo} />
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Google connection</div>
          <p className="mt-1 text-sm text-slate-600">Check whether Scheduler can still reach Google.</p>
        </div>

        <button
          type="button"
          onClick={() => runCheck()}
          disabled={isPending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Checking..." : "Check Google"}
        </button>
      </div>
    </section>
  );
}
