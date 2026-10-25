import { requireRole } from '@/lib/auth';
import NextBlockClient from './next-block-client';

export default async function StartNextBlockPage() {
  await requireRole(['admin']);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Start another session</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Create the next session without changing prior forms, workbooks, responses, rosters, or history.
        </p>
      </div>
      <NextBlockClient />
    </main>
  );
}
