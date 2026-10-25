'use server';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { getAnnualSetupStatusForActiveYear } from '@/lib/annual-setup';
function clean(value: FormDataEntryValue | null) { return String(value ?? '').trim(); }
async function makeCurrentBlock(blockId: string) {
  const supabase = createAdminClient();
  const { data: block, error: blockError } = await supabase.from('blocks').select('*').eq('id', blockId).single();
  if (blockError || !block) throw new Error('Session not found.');
  const { error: clearError } = await supabase.from('blocks').update({ is_current: false }).eq('school_year_id', block.school_year_id);
  if (clearError) throw new Error(`Could not clear current session: ${clearError.message}`);
  const { error: setError } = await supabase.from('blocks').update({ is_current: true }).eq('id', blockId);
  if (setError) throw new Error(`Could not set current session: ${setError.message}`);
  return block;
}
export async function createBlock(formData: FormData) {
  await requireRole(['admin']);
  const supabase = createAdminClient();
  const label = clean(formData.get('label'));
  if (!label) throw new Error('Session name is required.');
  const { data: year, error: yearError } = await supabase.from('school_years').select('*').eq('is_active', true).single();
  if (yearError || !year) throw new Error('No active school year found.');
  const { count: existingSessionCount, error: countError } = await supabase.from('blocks').select('id', { count: 'exact', head: true }).eq('school_year_id', year.id);
  if (countError) throw new Error(`Could not check existing sessions: ${countError.message}`);
  if ((existingSessionCount ?? 0) === 0) {
    const setup = await getAnnualSetupStatusForActiveYear();
    if (!setup.annualSetupComplete) throw new Error('Finish annual setup and confirm the Google homeroom list before creating the first session.');
  }
  await supabase.from('blocks').update({ is_current: false }).eq('school_year_id', year.id);
  const { error } = await supabase.from('blocks').insert({ school_year_id: year.id, label, status: 'setup', teacher_offerings_open: false, student_form_open: false, matching_locked: false, public_club_submission_open: false, is_current: true });
  if (error) throw new Error(`Could not create session: ${error.message}`);
  revalidatePath('/admin/blocks'); revalidatePath('/admin/clubs'); revalidatePath('/admin/student-submissions'); revalidatePath('/admin/workflow');
}
export async function setCurrentBlock(formData: FormData) {
  await requireRole(['admin']); const blockId = clean(formData.get('block_id')); if (!blockId) throw new Error('Missing block id.'); await makeCurrentBlock(blockId); revalidatePath('/admin/blocks'); revalidatePath('/admin/clubs'); revalidatePath('/admin/student-submissions');
}
export async function openClubIntake(formData: FormData) {
  await requireRole(['admin']); const supabase = createAdminClient(); const blockId = clean(formData.get('block_id')); if (!blockId) throw new Error('Missing block id.'); await makeCurrentBlock(blockId);
  const { error } = await supabase.from('blocks').update({ public_club_submission_open: true, student_form_open: false, teacher_offerings_open: false, status: 'offerings_open', matching_locked: false }).eq('id', blockId);
  if (error) throw new Error(`Could not open club leader submissions: ${error.message}`); revalidatePath('/admin/blocks'); revalidatePath('/admin/clubs'); revalidatePath('/admin/student-submissions');
}
export async function openStudentForm(formData: FormData) {
  await requireRole(['admin']); const supabase = createAdminClient(); const blockId = clean(formData.get('block_id')); if (!blockId) throw new Error('Missing block id.'); await makeCurrentBlock(blockId);
  const { error } = await supabase.from('blocks').update({ public_club_submission_open: false, student_form_open: true, teacher_offerings_open: false, status: 'student_open', matching_locked: false }).eq('id', blockId);
  if (error) throw new Error(`Could not open student form: ${error.message}`); revalidatePath('/admin/blocks'); revalidatePath('/admin/clubs'); revalidatePath('/admin/student-submissions');
}
export async function closeFormsForMatching(formData: FormData) {
  await requireRole(['admin']); const supabase = createAdminClient(); const blockId = clean(formData.get('block_id')); if (!blockId) throw new Error('Missing block id.'); await makeCurrentBlock(blockId);
  const { error } = await supabase.from('blocks').update({ public_club_submission_open: false, student_form_open: false, teacher_offerings_open: false, status: 'matching', matching_locked: false }).eq('id', blockId);
  if (error) throw new Error(`Could not close forms for matching: ${error.message}`); revalidatePath('/admin/blocks'); revalidatePath('/admin/clubs'); revalidatePath('/admin/student-submissions');
}
