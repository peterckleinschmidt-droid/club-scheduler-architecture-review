'use server';

import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { validateClubOffering } from '@/lib/validations';
import { createHash } from 'node:crypto';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function parseCheckboxValues(values: FormDataEntryValue[]) {
  return values.map((v) => String(v).trim()).filter(Boolean);
}

function parseGradeCheckboxes(values: FormDataEntryValue[]) {
  return values
    .map((v) => Number(v))
    .filter((n) => [3, 4, 5].includes(n));
}

async function studentFormExistsForCurrentBlock() {
  const supabase = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return false;
  }

  const { data, error } = await supabase
    .from('google_workspace_links')
    .select('google_student_form_id')
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not check student form status: ${error.message}`);
  }

  return Boolean(data?.google_student_form_id);
}

function revalidateClubPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/clubs');
  revalidatePath('/admin/workflow');
  revalidatePath('/admin/google-workspace');
  revalidatePath('/admin/prepare-form');
}

export async function togglePublicClubSubmission(formData: FormData) {
  await requireRole(['admin']);
  const supabase = createAdminClient();

  const blockId = clean(formData.get('block_id'));
  const open = formData.get('open') === 'true';

  if (!blockId) throw new Error('Missing block id.');

  const { error } = await supabase
    .from('blocks')
    .update({ public_club_submission_open: open })
    .eq('id', blockId);

  if (error) {
    throw new Error(`Could not update public submission status: ${error.message}`);
  }

  revalidateClubPaths();
}

export async function rotatePublicClubToken(formData: FormData) {
  await requireRole(['admin']);
  const supabase = createAdminClient();

  const blockId = clean(formData.get('block_id'));
  if (!blockId) throw new Error('Missing block id.');

  const newToken = crypto.randomUUID().replace(/-/g, '');

  const { error } = await supabase
    .from('blocks')
    .update({ public_club_submission_token: newToken })
    .eq('id', blockId);

  if (error) {
    throw new Error(`Could not rotate submission token: ${error.message}`);
  }

  revalidateClubPaths();
}

export async function saveClubAdmin(formData: FormData) {
  const user = await requireRole(['admin']);
  const supabase = createAdminClient();
  const { block } = await getActiveContext();

  if (!block) throw new Error('No active session.');

  const id = clean(formData.get('id'));
  const isNewClub = !id;

  if (isNewClub) {
    const formExists = await studentFormExistsForCurrentBlock();

    if (formExists) {
      throw new Error(
        'The student form has already been created for this session. New clubs cannot be added after the form is created. If a new club is needed, do not use the existing form without talking through the workflow first.'
      );
    }
  }

  const existing = id ? (await supabase.from('club_offerings').select('spanish_translation_source_hash').eq('id', id).maybeSingle()).data : null;
  const sourceText = [clean(formData.get('club_title')), clean(formData.get('section_label')), clean(formData.get('description'))].join('\n');
  const sourceHash = createHash('sha256').update(sourceText).digest('hex');
  const sourceChanged = Boolean(existing?.spanish_translation_source_hash && existing.spanish_translation_source_hash !== sourceHash);
  const meeting_days = parseCheckboxValues(formData.getAll('meeting_days'));
  const eligible_grades = parseGradeCheckboxes(formData.getAll('eligible_grades'));

  const payload: any = {
    block_id: block.id,
    submitted_by_user_id: user.id,
    club_title: clean(formData.get('club_title')),
    section_label: clean(formData.get('section_label')) || null,
    description: clean(formData.get('description')),
    club_title_es: clean(formData.get('club_title_es')) || null,
    section_label_es: clean(formData.get('section_label_es')) || null,
    description_es: clean(formData.get('description_es')) || null,
    spanish_translation_ready: sourceChanged ? false : formData.get('spanish_translation_ready') === 'on',
    spanish_translation_source_hash: sourceHash,
    spanish_translation_source: clean(formData.get('club_title_es')) || clean(formData.get('description_es')) ? 'manual_or_suggested' : null,
    spanish_translation_updated_at: clean(formData.get('club_title_es')) || clean(formData.get('description_es')) ? new Date().toISOString() : null,
    sponsor_name: clean(formData.get('sponsor_name')),
    leader_email: clean(formData.get('leader_email')) || null,
    meeting_days,
    capacity_type: clean(formData.get('capacity_type')) || 'limited',
    max_capacity: clean(formData.get('max_capacity'))
      ? Number(formData.get('max_capacity'))
      : null,
    minimum_viable_enrollment: clean(formData.get('minimum_viable_enrollment'))
      ? Number(formData.get('minimum_viable_enrollment'))
      : null,
    minimum_applies_to: clean(formData.get('minimum_applies_to')) || 'section',
    grade_limited: formData.get('grade_limited') === 'on',
    eligible_grades: eligible_grades.length > 0 ? eligible_grades : null,
    eligible_grade: eligible_grades.length === 1 ? eligible_grades[0] : null,
    matching_preference:
      clean(formData.get('matching_preference')) || 'highest_interest',
    admin_notes: clean(formData.get('admin_notes')) || null,
    is_active: formData.get('is_active') === 'on',
    show_to_students: formData.get('show_to_students') === 'on',
  };

  let clubId = '';

  if (id) {
    const { data, error } = await supabase
      .from('club_offerings')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Could not update club offering: ${error.message}`);
    clubId = data.id;
  } else {
    const { data, error } = await supabase
      .from('club_offerings')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(`Could not create club offering: ${error.message}`);
    clubId = data.id;
  }

  await validateClubOffering(block.id, clubId);
  revalidateClubPaths();
}

export async function deleteClubAdmin(formData: FormData) {
  await requireRole(['admin']);
  const supabase = createAdminClient();

  const id = clean(formData.get('id'));
  if (!id) throw new Error('Missing club id.');

  const formExists = await studentFormExistsForCurrentBlock();

  if (formExists) {
    throw new Error(
      'The student form has already been created for this session. Clubs cannot be deleted after the form is created because students may already have seen or selected them.'
    );
  }

  const { error } = await supabase.from('club_offerings').delete().eq('id', id);

  if (error) {
    throw new Error(`Could not delete club offering: ${error.message}`);
  }

  revalidateClubPaths();
}