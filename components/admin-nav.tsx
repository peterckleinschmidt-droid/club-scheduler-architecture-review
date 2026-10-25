'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Props = {
  yearLabel?: string | null;
  blockLabel?: string | null;
};

type Item = {
  href: string;
  label: string;
};

type MenuGroup = {
  label: string;
  items: Item[];
};

const primaryItems: Item[] = [
  { href: '/admin/workflow', label: 'Home' },
  { href: '/admin/clubs', label: 'Club setup' },
  { href: '/admin/teachers', label: 'Homerooms' },
  { href: '/admin/blocks', label: 'Sessions' },
  { href: '/admin/reports', label: 'Reports' },
];

const moreGroups: MenuGroup[] = [
  {
    label: 'School year and Google',
    items: [
      { href: '/admin/year-google-workspace', label: 'Annual setup' },
      { href: '/admin/google-workspace', label: 'Session Google tools' },
      { href: '/admin/archive', label: 'Past years' },
    ],
  },
  {
    label: 'Roster details',
    items: [
      { href: '/admin/matching', label: 'Matching details' },
      { href: '/admin/review', label: 'Roster review' },
      { href: '/admin/rosters', label: 'Final rosters' },
    ],
  },
  {
    label: 'Administration and support',
    items: [
      { href: '/admin/admins', label: 'Administrators' },
      { href: '/admin/test-data', label: 'Test data' },
    ],
  },
];

const moreItems = moreGroups.flatMap((group) => group.items);

function isActivePath(pathname: string, href: string) {
  if (href === '/admin/workflow') {
    return pathname === '/admin' || pathname === '/admin/workflow';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function RibbonLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActivePath(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={[
        'inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition',
        active
          ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
          : 'text-slate-600 hover:bg-white/80 hover:text-slate-950',
      ].join(' ')}
    >
      {item.label}
    </Link>
  );
}

export function AdminNav({ yearLabel, blockLabel }: Props) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreActive = moreItems.some((item) => isActivePath(pathname, item.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!moreMenuRef.current?.contains(event.target as Node)) setMoreOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMoreOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  return (
    <header className="sticky top-0 z-40 bg-white">
      <div className="flex h-11 items-center border-b border-slate-200 px-5">
        <Link href="/admin/workflow" className="text-base font-bold tracking-tight text-slate-950">
          Club Scheduler
        </Link>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="hidden font-medium text-slate-700 lg:inline">
            {yearLabel || 'No active school year'}
          </span>
          <span className="hidden text-slate-300 lg:inline">|</span>
          <span className="font-semibold text-slate-900">{blockLabel || 'No session selected'}</span>
          <Link href="/admin/blocks" className="rounded-md px-2 py-1 font-semibold text-blue-700 hover:bg-blue-50">
            Change session
          </Link>
        </div>
      </div>

      <nav aria-label="Scheduler navigation" className="flex min-h-13 items-center gap-1 overflow-visible border-b border-slate-200 bg-slate-50 px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-2">
          {primaryItems.map((item) => (
            <RibbonLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        <div ref={moreMenuRef} className="relative ml-2 shrink-0">
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((open) => !open)}
            className={[
              'flex h-9 cursor-pointer items-center gap-1 rounded-lg px-3 text-sm font-semibold transition',
              moreActive
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-950',
            ].join(' ')}
          >
            More tools
            <span aria-hidden="true" className={`text-xs transition ${moreOpen ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>

          {moreOpen ? (
            <div role="menu" className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {moreGroups.map((group, groupIndex) => (
                <div
                  key={group.label}
                  className={groupIndex > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''}
                >
                  <div className="px-3 pb-1 pt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={[
                          'block rounded-lg px-3 py-2 text-sm font-medium transition',
                          active
                            ? 'bg-blue-50 text-blue-800'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950',
                        ].join(' ')}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
