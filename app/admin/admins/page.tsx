import { createClient } from '@/lib/supabase/server';
import { AdminsTableClient } from './admins-table-client';

export type AdminUserRow = {
  id: string;
  email: string | null;
  role: string | null;
};

export default async function AdminsPage() {
  const supabase = await createClient();

  const { data: admins = [] } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('role', 'admin')
    .order('email', { ascending: true });

  const adminRows: AdminUserRow[] = (admins ?? []) as AdminUserRow[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Manage Admins</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Choose who can manage the scheduler. Admins can sign in even if their
          email is outside the regular school domain.
        </p>
      </div>

      <AdminsTableClient admins={adminRows} />
    </div>
  );
}
