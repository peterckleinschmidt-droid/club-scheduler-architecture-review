'use server';

import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { runMatching } from '@/lib/matching/engine';
import { revalidatePath } from 'next/cache';

export async function runMatch() {
  await requireRole(['admin']);
  const { block } = await getActiveContext();

  if (!block) throw new Error('No active session');

  await runMatching(block.id, 'initial');

  const admin = createAdminClient();
  const { error } = await admin
    .from('blocks')
    .update({ status: 'review' })
    .eq('id', block.id);

  if (error) {
    throw new Error(`Matching completed, but the workflow status could not be updated: ${error.message}`);
  }

  revalidatePath('/admin/matching');
  revalidatePath('/admin/review');
  revalidatePath('/admin/workflow');
}
