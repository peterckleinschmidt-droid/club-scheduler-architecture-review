'use server';

import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
}

export async function updateStudentRegistry(formData: FormData) {
  await requireRole(['admin']);
  const supabase = await createClient();

  const id = clean(formData.get('id'));
  const student_name = clean(formData.get('student_name'));
  const grade = Number(formData.get('grade'));
  const teacher_id_raw = clean(formData.get('teacher_id'));
  const teacher_homeroom_text = clean(formData.get('teacher_homeroom_text'));
  const is_active = formData.get('is_active') === 'on';

  if (!id) {
    throw new Error('Missing student id.');
  }

  if (!student_name) {
    throw new Error('Student name is required.');
  }

  if (![3, 4, 5].includes(grade)) {
    throw new Error('Grade must be 3, 4, or 5.');
  }

  const teacher_id = teacher_id_raw ? teacher_id_raw : null;

  const { error } = await supabase
    .from('students')
    .update({
      student_name,
      grade,
      teacher_id,
      teacher_homeroom_text: teacher_homeroom_text || null,
      is_active,
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Could not update student: ${error.message}`);
  }

  revalidatePath('/admin/students-roster');
}