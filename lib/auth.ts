import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function getSessionUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile;
}

export async function requireRole(
  roles: Array<'admin' | 'teacher' | 'student'>
) {
  const profile = await getSessionUser();

  if (!profile) {
    redirect('/login');
  }

  if (!profile.is_active || !roles.includes(profile.role)) {
    redirect('/unauthorized');
  }

  return profile;
}

function blockSortValue(label: string | null | undefined) {
  const match = String(label ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : -1;
}

export async function getActiveContext() {
  const supabase = await createClient();

  const { data: year } = await supabase
    .from('school_years')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (!year) {
    return { year: null, block: null };
  }

  const { data: currentBlock } = await supabase
    .from('blocks')
    .select('*')
    .eq('school_year_id', year.id)
    .eq('is_current', true)
    .maybeSingle();

  if (currentBlock) {
    return { year, block: currentBlock };
  }

  const { data: blocksData = [] } = await supabase
    .from('blocks')
    .select('*')
    .eq('school_year_id', year.id);

  const blockRows = (blocksData ?? []) as any[];

  const sortedBlocks = [...blockRows].sort((a: any, b: any) => {
    const aVal = blockSortValue(a.label);
    const bVal = blockSortValue(b.label);

    if (aVal !== bVal) return bVal - aVal;
    return String(b.label ?? '').localeCompare(String(a.label ?? ''));
  });

  return { year, block: sortedBlocks[0] ?? null };
}