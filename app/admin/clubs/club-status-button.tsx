'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateClubStudentStatus,
  type ClubStatusAction,
} from './club-status-actions';

const LOCKED_MESSAGE =
  'Availability is locked because the student form has already been created.';

export default function ClubStatusButton({
  clubId,
  action,
  disabled = false,
}: {
  clubId: string;
  action: ClubStatusAction;
  disabled?: boolean;
}) {
  const router = useRouter();
  const tooltipId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const label =
    action === 'make_available'
      ? 'Make available'
      : action === 'hide'
        ? 'Hide'
        : 'Reactivate';

  function run() {
    if (disabled) return;

    setMessage(null);
    setError(false);

    startTransition(async () => {
      const result = await updateClubStudentStatus({ clubId, action });
      setMessage(result.message);
      setError(!result.ok);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  if (disabled) {
    return (
      <div
        className="group/status-action relative inline-flex"
        onClick={(event) => event.stopPropagation()}
      >
        <span
          role="button"
          tabIndex={0}
          aria-disabled="true"
          aria-describedby={tooltipId}
          className="cursor-help text-xs font-semibold text-slate-400 outline-none decoration-dotted underline-offset-2 hover:underline focus:underline"
        >
          {label}
        </span>

        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-64 rounded-lg bg-slate-950 px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-xl group-hover/status-action:block group-focus-within/status-action:block"
        >
          {LOCKED_MESSAGE}
          <span
            aria-hidden="true"
            className="absolute -top-1 right-4 h-2 w-2 rotate-45 bg-slate-950"
          />
        </span>
      </div>
    );
  }

  return (
    <div
      className="inline-flex flex-col items-start"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="text-xs font-semibold text-blue-700 hover:underline disabled:cursor-wait disabled:text-slate-400"
      >
        {pending ? 'Updating...' : label}
      </button>

      {message && error ? (
        <div className="mt-2 max-w-64 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-950">
          {message}
        </div>
      ) : null}
    </div>
  );
}
