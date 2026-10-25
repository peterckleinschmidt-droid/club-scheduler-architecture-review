'use client';

import { useEffect, useMemo, useState } from 'react';

const PARTICIPATION_OPTIONS = [
  ['none', 'I do not want any clubs this round'],
  ['one', 'I would like at most 1 club this round'],
  ['two', 'I would like at most 2 clubs this round'],
  ['three', 'I would like at most 3 clubs this round'],
] as const;

export function StudentParticipationSection({
  defaultParticipation,
  clubIds,
  initialScores = {},
}: {
  defaultParticipation: string;
  clubIds: string[];
  initialScores?: Record<string, number>;
}) {
  const [participation, setParticipation] = useState(defaultParticipation);
  const [scores, setScores] = useState<Record<string, number>>(initialScores);

  useEffect(() => {
    const listeners: Array<{ el: Element; fn: EventListener }> = [];

    clubIds.forEach((clubId) => {
      const radios = document.querySelectorAll(`input[name="interest_${clubId}"]`);

      radios.forEach((radio) => {
        const fn: EventListener = (event) => {
          const target = event.target as HTMLInputElement;
          setScores((prev) => ({
            ...prev,
            [clubId]: Number(target.value),
          }));
        };

        radio.addEventListener('change', fn);
        listeners.push({ el: radio, fn });
      });
    });

    return () => {
      listeners.forEach(({ el, fn }) => {
        el.removeEventListener('change', fn);
      });
    };
  }, [clubIds]);

  const showNoClubsWarning = useMemo(() => {
    const hasPositiveInterest = Object.values(scores).some(
      (score) => Number(score) > 0
    );

    return participation === 'none' && hasPositiveInterest;
  }, [participation, scores]);

  return (
    <div className="rounded-2xl border bg-white p-4">
      <h2 className="text-xl font-semibold">How many clubs would you like?</h2>

      <p className="mt-1 text-sm text-slate-600">
        Read through the club choices above first, then decide how many clubs you want this round.
      </p>

      {PARTICIPATION_OPTIONS.map(([value, label]) => (
        <label key={value} className="mt-3 block rounded-xl border p-4 text-lg">
          <input
            required
            type="radio"
            name="participation_preference"
            value={value}
            className="mr-3"
            defaultChecked={defaultParticipation === value}
            onChange={() => setParticipation(value)}
          />
          {label}
        </label>
      ))}

      {showNoClubsWarning ? (
        <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          You marked interest in one or more clubs, but you also chose “I do not want any clubs this round.”
          If you submit this way, you will not be assigned to any clubs.
        </div>
      ) : null}
    </div>
  );
}