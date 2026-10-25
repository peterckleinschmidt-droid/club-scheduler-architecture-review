'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function AccountMenu({ displayName }: { displayName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function endSession(destination: string) {
    setWorking(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        setError(signOutError.message);
        setWorking(false);
        return;
      }

      setOpen(false);
      router.replace(destination);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not sign out.');
      setWorking(false);
    }
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setError(null);
          setOpen((current) => !current);
        }}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>{displayName}</span>
        <span aria-hidden="true" className={`text-xs transition ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Signed in as
            </div>
            <div className="mt-1 truncate font-semibold text-slate-900">{displayName}</div>
          </div>

          <button
            type="button"
            role="menuitem"
            disabled={working}
            onClick={() => endSession('/login?changeAccount=1')}
            className="mt-2 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
          >
            {working ? 'Signing out...' : 'Change account'}
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={working}
            onClick={() => endSession('/login')}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            Sign out
          </button>

          {error ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
