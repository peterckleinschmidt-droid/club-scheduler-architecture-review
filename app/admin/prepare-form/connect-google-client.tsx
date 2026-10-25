"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GOOGLE_FORMS_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/script.projects",
].join(" ");

type ConnectGoogleFormsClientProps = {
  label?: string;
  returnTo?: string;
};

function safeReturnTo(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) return "/admin/workflow";
  if (!trimmed.startsWith("/admin")) return "/admin/workflow";
  if (trimmed.startsWith("//")) return "/admin/workflow";

  return trimmed;
}

export default function ConnectGoogleFormsClient({
  label = "Connect Google",
  returnTo,
}: ConnectGoogleFormsClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedReturnTo = useMemo(() => {
    if (returnTo) return safeReturnTo(returnTo);

    const query = searchParams.toString();
    return safeReturnTo(query ? `${pathname}?${query}` : pathname);
  }, [pathname, returnTo, searchParams]);

  async function connectGoogle() {
    setError(null);
    setIsConnecting(true);

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const callbackUrl = new URL("/auth/google-forms/callback", origin);
      callbackUrl.searchParams.set("returnTo", resolvedReturnTo);

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: GOOGLE_FORMS_SCOPES,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (signInError) {
        setError(signInError.message);
        setIsConnecting(false);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not connect Google.");
      setIsConnecting(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={connectGoogle}
        disabled={isConnecting}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isConnecting ? "Connecting..." : label}
      </button>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          {error}
        </div>
      ) : null}
    </div>
  );
}

