import Link from 'next/link';
import { getActiveContext, getSessionUser } from '@/lib/auth';
import { AccountMenu } from '@/components/account-menu';

export async function AppHeader() {
  const user = await getSessionUser();
  const { year, block } = await getActiveContext();

  return (
    <header className="no-print border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between p-4">
        <Link href="/" className="text-lg font-bold">
          Lincoln Club Scheduler
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span>{year?.label ?? 'No active year'}</span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">
            {block?.label ?? 'No active session'}
          </span>
          {user ? <AccountMenu displayName={user.full_name ?? 'Account'} /> : null}
        </div>
      </div>
    </header>
  );
}
