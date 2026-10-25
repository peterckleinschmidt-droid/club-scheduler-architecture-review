"use client";

import { useState, type FormEvent } from 'react';
import { addAdmin, removeAdmin } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AdminUserRow } from './page';

export function AdminsTableClient({ admins }: { admins: AdminUserRow[] }) {
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function confirmRemove(event: FormEvent<HTMLFormElement>, admin: AdminUserRow) {
    const confirmed = window.confirm(
      `Remove admin access for ${admin.email ?? 'this person'}?`
    );

    if (!confirmed) {
      event.preventDefault();
    }
  }

  async function handleAddAdmin(formData: FormData) {
    setIsSaving(true);

    try {
      await addAdmin(formData);
      setEmail('');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not add admin.';
      window.alert(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveAdmin(formData: FormData) {
    const id = String(formData.get('id') ?? '');
    setRemovingId(id);

    try {
      await removeAdmin(formData);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not remove admin.';
      window.alert(message);
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-lg font-semibold">Add admin</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add the email address this person uses for Google sign-in. People outside
          the school domain are allowed only when they are listed here.
        </p>

        <form action={handleAddAdmin} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
          />
          <Button type="submit" disabled={isSaving}>
            {isSaving ? 'Adding...' : 'Add admin'}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="border-b p-4">
          <h2 className="text-lg font-semibold">Current admins</h2>
          <p className="mt-1 text-sm text-slate-600">
            These people can manage sessions, clubs, matching, rosters, and reports.
          </p>
        </div>

        {admins.length === 0 ? (
          <div className="p-4 text-sm text-slate-600">
            No admins found.
          </div>
        ) : (
          <div className="divide-y">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-950">
                    {admin.email ?? 'No email listed'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Admin</div>
                </div>

                <form
                  action={handleRemoveAdmin}
                  onSubmit={(event) => confirmRemove(event, admin)}
                >
                  <input type="hidden" name="id" value={admin.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={removingId === admin.id}
                  >
                    {removingId === admin.id ? 'Removing...' : 'Remove admin'}
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
