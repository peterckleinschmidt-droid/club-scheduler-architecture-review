'use server';

import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { pushSchedulerHomeroomsToGoogle } from './google-homeroom-sync';

function cleanName(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

function revalidateTeachersPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/teachers');
  revalidatePath('/admin/year-google-workspace');
  revalidatePath('/admin/google-workspace');
  revalidatePath('/admin/workflow');
  revalidatePath('/admin/students-roster');
  revalidatePath('/admin/student-submissions');
  revalidatePath('/admin/rosters');
}

function randomHomeroomCode() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `HR-${random}`;
}

async function createUniqueHomeroomCode() {
  const supabase = createAdminClient();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomHomeroomCode();

    const { data, error } = await supabase
      .from('teachers')
      .select('id')
      .eq('homeroom_code', code)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not check homeroom code: ${error.message}`);
    }

    if (!data?.id) {
      return code;
    }
  }

  throw new Error('Could not create a unique homeroom code. Please try again.');
}

async function ensureTeacherHasHomeroomCode(id: string) {
  const supabase = createAdminClient();

  const { data: teacher, error: teacherError } = await supabase
    .from('teachers')
    .select('id, homeroom_code')
    .eq('id', id)
    .maybeSingle();

  if (teacherError) {
    throw new Error(`Could not check homeroom code: ${teacherError.message}`);
  }

  if (!teacher?.id) {
    throw new Error('Could not find homeroom.');
  }

  if (teacher.homeroom_code) {
    return teacher.homeroom_code as string;
  }

  const homeroomCode = await createUniqueHomeroomCode();

  const { error: updateError } = await supabase
    .from('teachers')
    .update({ homeroom_code: homeroomCode })
    .eq('id', id);

  if (updateError) {
    throw new Error(`Could not save homeroom code: ${updateError.message}`);
  }

  return homeroomCode;
}

async function trySyncHomeroomsToGoogle() {
  try {
    const { year } = await getActiveContext();

    if (!year) {
      return;
    }

    const supabase = await createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const providerToken = session?.provider_token;

    if (!providerToken) {
      return;
    }

    const result = await pushSchedulerHomeroomsToGoogle({
      accessToken: providerToken,
      schoolYearId: year.id,
    });

    if (!result.ok) {
      console.warn('Homerooms were saved, but Google was not updated:', result.message);
    }
  } catch (error) {
    console.warn('Homerooms were saved, but Google sync failed:', error);
  }
}

export async function addTeacher(formData: FormData) {
  await requireRole(['admin']);

  const supabase = createAdminClient();

  const teacher_name = cleanName(formData.get('teacher_name'));

  if (!teacher_name) {
    throw new Error('Please enter a homeroom name.');
  }

  const homeroomCode = await createUniqueHomeroomCode();

  const { error } = await supabase.from('teachers').insert({
    teacher_name,
    homeroom_code: homeroomCode,
    sort_order: 0,
    is_active: true,
  });

  if (error) {
    throw new Error(`Could not add homeroom: ${error.message}`);
  }

  await trySyncHomeroomsToGoogle();

  revalidateTeachersPaths();
}

export async function updateTeacher(formData: FormData) {
  await requireRole(['admin']);

  const supabase = createAdminClient();

  const id = String(formData.get('id') ?? '');
  const teacher_name = cleanName(formData.get('teacher_name'));

  if (!id) {
    throw new Error('Missing homeroom id.');
  }

  if (!teacher_name) {
    throw new Error('Homeroom name cannot be blank.');
  }

  await ensureTeacherHasHomeroomCode(id);

  const { error } = await supabase
    .from('teachers')
    .update({ teacher_name })
    .eq('id', id);

  if (error) {
    throw new Error(`Could not update homeroom: ${error.message}`);
  }

  await trySyncHomeroomsToGoogle();

  revalidateTeachersPaths();
}

export async function deleteTeacher(formData: FormData) {
  await requireRole(['admin']);

  const supabase = createAdminClient();
  const { year } = await getActiveContext();

  const id = String(formData.get('id') ?? '');

  if (!id) {
    throw new Error('Missing homeroom id.');
  }

  if (year) {
    const { count, error: countError } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('school_year_id', year.id)
      .eq('teacher_id', id);

    if (countError) {
      throw new Error(`Could not check current students: ${countError.message}`);
    }

    if ((count ?? 0) > 0) {
      throw new Error(
        'This homeroom cannot be deleted because current-year students are still assigned to it.'
      );
    }
  }

  /*
   * Older years may still have students linked to this homeroom through teacher_id.
   * Those links should not prevent cleanup when a homeroom is no longer needed.
   * The student's saved homeroom display text remains on the student record for
   * past rosters and archive views.
   */
  const { error: unlinkError } = await supabase
    .from('students')
    .update({ teacher_id: null })
    .eq('teacher_id', id);

  if (unlinkError) {
    throw new Error(`Could not clear past student links: ${unlinkError.message}`);
  }

  const { error } = await supabase.from('teachers').delete().eq('id', id);

  if (error) {
    throw new Error(`Could not delete homeroom: ${error.message}`);
  }

  await trySyncHomeroomsToGoogle();

  revalidateTeachersPaths();
}