import { requireRole, getActiveContext } from '@/lib/auth';
import { AdminNav } from '@/components/admin-nav';
import AdminGoogleHealthStatus from '@/components/admin-google-health-status';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();

  return (
    <div className="min-h-screen bg-white">
      <AdminNav yearLabel={year?.label ?? null} blockLabel={block?.label ?? null} />

      <div className="border-b border-slate-200 bg-white px-5 py-2">
        <AdminGoogleHealthStatus />
      </div>

      <main className="mx-auto w-full max-w-[1680px] px-5 py-5 lg:px-6 lg:py-6">
        {children}
      </main>
    </div>
  );
}


