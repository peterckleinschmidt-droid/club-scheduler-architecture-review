'use server';

import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

function cleanEmail(value: FormDataEntryValue | null) {
  return String(value ?? '').trim().toLowerCase();
}

function isLikelyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findAuthUserIdByEmail({
  supabase,
  email,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  email: string;
}) {
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (error) return null;

    const authUser = data.users.find(
      (user) => String(user.email ?? '').toLowerCase() === email
    );

    return authUser?.id ?? null;
  } catch {
    return null;
  }
}

export async function addAdmin(formData: FormData) {
  await requireRole(['admin']);
  const supabase = createAdminClient();

  const email = cleanEmail(formData.get('email'));

  if (!email || !isLikelyEmail(email)) {
    throw new Error('Enter a valid email address.');
  }

  const { data: existingUser, error: existingError } = await supabase
    .from('users')
    .select('id, email, role')
    .ilike('email', email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not check this admin: ${existingError.message}`);
  }

  if (existingUser) {
    const { error } = await supabase
      .from('users')
      .update({ role: 'admin', email })
      .eq('id', existingUser.id);

    if (error) {
      throw new Error(`Could not update admin: ${error.message}`);
    }

    revalidatePath('/admin/admins');
    return;
  }

  const authUserId = await findAuthUserIdByEmail({ supabase, email });

  if (!authUserId) {
    throw new Error(
      'Could not add admin yet. Have this person sign in once, then try adding them again.'
    );
  }

  const { error } = await supabase.from('users').insert({
    id: authUserId,
    email,
    role: 'admin',
  });

  if (error) {
    throw new Error(`Could not add admin: ${error.message}`);
  }

  revalidatePath('/admin/admins');
}

export async function removeAdmin(formData: FormData) {
  const currentUser = await requireRole(['admin']);
  const supabase = createAdminClient();

  const id = String(formData.get('id') ?? '').trim();

  if (!id) {
    throw new Error('Missing admin id.');
  }

  if (id === currentUser.id) {
    throw new Error('You cannot remove your own admin access while signed in.');
  }

  const { error } = await supabase
    .from('users')
    .update({ role: 'student' })
    .eq('id', id);

  if (error) {
    throw new Error(`Could not remove admin access: ${error.message}`);
  }

  revalidatePath('/admin/admins');
}