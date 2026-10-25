'use server';

import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

async function mustSucceed(resultPromise: PromiseLike<any>, message: string) {
  const result = await resultPromise;

  if (result.error) {
    const details = [
      result.error.message,
      result.error.details,
      result.error.hint,
      result.error.code,
    ]
      .filter(Boolean)
      .join(' | ');

    throw new Error(`${message}: ${details || 'Unknown error'}`);
  }

  return result;
}

async function makeUniqueSchoolYearLabel(
  supabase: ReturnType<typeof createAdminClient>,
  baseLabel: string
) {
  const { data: existingYears = [], error } = await supabase
    .from('school_years')
    .select('label')
    .ilike('label', `${baseLabel}%`);

  if (error) {
    throw new Error(`Could not check existing school years: ${error.message}`);
  }

  const existingLabels = new Set(
    ((existingYears ?? []) as any[]).map((year) => String(year.label))
  );

  if (!existingLabels.has(baseLabel)) {
    return baseLabel;
  }

  let counter = 2;

  while (existingLabels.has(`${baseLabel} (${counter})`)) {
    counter += 1;
  }

  return `${baseLabel} (${counter})`;
}

export async function yearEndReset(formData: FormData) {
  const user = await requireRole(['admin']);
  const supabase = createAdminClient();

  const confirmation = clean(formData.get('confirm'));
  const requestedYearLabel = clean(formData.get('new_year_label'));

  if (confirmation !== 'START NEW SCHOOL YEAR') {
    throw new Error('Confirmation phrase did not match.');
  }

  if (!requestedYearLabel) {
    throw new Error('New school year label is required.');
  }

  const newYearLabel = await makeUniqueSchoolYearLabel(
    supabase,
    requestedYearLabel
  );

  const { data: activeYear, error: activeYearError } = await supabase
    .from('school_years')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (activeYearError) {
    throw new Error(
      `Could not load active school year: ${activeYearError.message}`
    );
  }

  if (activeYear) {
    await mustSucceed(
      supabase
        .from('school_years')
        .update({
          is_active: false,
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by_user_id: user.id,
        })
        .eq('id', activeYear.id),
      'Could not archive current school year'
    );

    await mustSucceed(
      supabase
        .from('blocks')
        .update({
          teacher_offerings_open: false,
          student_form_open: false,
          public_club_submission_open: false,
          matching_locked: true,
          is_current: false,
        })
        .eq('school_year_id', activeYear.id),
      'Could not lock archived school year sessions'
    );
  }

  await mustSucceed(
    supabase
      .from('school_years')
      .update({ is_active: false })
      .eq('is_active', true),
    'Could not deactivate other active school years'
  );

  await mustSucceed(
    supabase
      .from('blocks')
      .update({ is_current: false })
      .eq('is_current', true),
    'Could not clear current session flag'
  );

  const { data: newYear, error: newYearError } = await supabase
    .from('school_years')
    .insert({
      label: newYearLabel,
      is_active: true,
      is_archived: false,
      archived_at: null,
      archived_by_user_id: null,
    })
    .select()
    .single();

  if (newYearError || !newYear) {
    throw new Error(
      `Could not create new active school year: ${
        newYearError?.message ?? 'Unknown error'
      }`
    );
  }

  revalidatePath('/admin');
  revalidatePath('/admin/blocks');
  revalidatePath('/admin/teachers');
  revalidatePath('/admin/students-roster');
  revalidatePath('/admin/clubs');
  revalidatePath('/admin/student-submissions');
  revalidatePath('/admin/matching');
  revalidatePath('/admin/review');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/reset');
  revalidatePath('/admin/archive');

  redirect('/admin/year-google-workspace');
}
