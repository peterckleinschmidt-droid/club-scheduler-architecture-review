'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validateClubOffering } from '@/lib/validations';

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

function makeEditToken() {
  return crypto.randomUUID().replace(/-/g, '');
}

export async function submitPublicClubOffering(
  blockId: string,
  token: string,
  formData: FormData
) {
  const supabase = createAdminClient();

  const { data: block, error: blockError } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .single();

  if (blockError || !block) {
    throw new Error('Session not found.');
  }

  if (!block.public_club_submission_open) {
    throw new Error('Club submissions are currently closed.');
  }

  if (!token || token !== block.public_club_submission_token) {
    throw new Error('This club submission link is invalid or expired.');
  }

  const clubId = clean(formData.get('club_id'));
  const editToken = clean(formData.get('edit_token'));

  const meeting_days = parseCheckboxValues(formData.getAll('meeting_days'));
  const eligible_grades = parseGradeCheckboxes(formData.getAll('eligible_grades'));

  const payload: any = {
    block_id: blockId,
    submitted_by_user_id: null,
    club_title: clean(formData.get('club_title')),
    section_label: clean(formData.get('section_label')) || null,
    description: clean(formData.get('description')),
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
    admin_notes: null,
    is_active: true,
    show_to_students: false,
  };

  if (!payload.club_title) {
    throw new Error('Club title is required.');
  }

  if (!payload.description) {
    throw new Error('Description is required.');
  }

  if (!payload.sponsor_name) {
    throw new Error('Sponsor / Host / Leader is required.');
  }

  if (!meeting_days.length) {
    throw new Error('Please select at least one meeting day.');
  }

  if (
    payload.capacity_type === 'limited' &&
    (!payload.max_capacity || payload.max_capacity < 1)
  ) {
    throw new Error('Limited capacity clubs require a valid maximum capacity.');
  }

  if (payload.grade_limited && eligible_grades.length === 0) {
    throw new Error('Please select at least one eligible grade.');
  }

  let savedClubId = '';
  let savedEditToken = editToken || makeEditToken();

  if (clubId && editToken) {
    const { data: existing, error: existingError } = await supabase
      .from('club_offerings')
      .select('*')
      .eq('id', clubId)
      .eq('block_id', blockId)
      .eq('public_edit_token', editToken)
      .single();

    if (existingError || !existing) {
      throw new Error('This edit link is invalid or expired.');
    }

    const { data, error } = await supabase
      .from('club_offerings')
      .update({
        ...payload,
        public_edit_token: editToken,
      })
      .eq('id', clubId)
      .select()
      .single();

    if (error) {
      throw new Error(`Could not update club offering: ${error.message}`);
    }

    savedClubId = data.id;
    savedEditToken = data.public_edit_token;
  } else {
    const { data, error } = await supabase
      .from('club_offerings')
      .insert({
        ...payload,
        public_edit_token: savedEditToken,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Could not submit club offering: ${error.message}`);
    }

    savedClubId = data.id;
    savedEditToken = data.public_edit_token;
  }

  await validateClubOffering(blockId, savedClubId);

  revalidatePath('/admin/clubs');
  revalidatePath(`/club-offerings/block/${blockId}/submit`);

  const confirmationUrl =
    `/club-offerings/block/${blockId}/submit/submitted` +
    `?token=${encodeURIComponent(token)}` +
    `&clubId=${encodeURIComponent(savedClubId)}` +
    `&editToken=${encodeURIComponent(savedEditToken)}`;

  redirect(confirmationUrl);
}

