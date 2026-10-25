import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { TeachersTableClient } from './teachers-table-client';

type TeacherRow = {
  id: string;
  teacher_name: string;
  is_active?: boolean | null;
  current_student_count?: number;
};

export default async function TeachersPage() {
  const supabase = await createClient();
  const { year } = await getActiveContext();

  const { data: teachers = [] } = await supabase
    .from('teachers')
    .select('*')
    .order('teacher_name', { ascending: true });

  const { data: currentStudents = [] } = year
    ? await supabase
        .from('students')
        .select('id, teacher_id')
        .eq('school_year_id', year.id)
    : { data: [] };

  const studentCountByTeacherId = new Map<string, number>();

  for (const student of currentStudents as any[]) {
    if (!student.teacher_id) continue;

    studentCountByTeacherId.set(
      student.teacher_id,
      (studentCountByTeacherId.get(student.teacher_id) ?? 0) + 1
    );
  }

  const teacherRows: TeacherRow[] = (teachers as any[]).map((teacher) => ({
    id: teacher.id,
    teacher_name: teacher.teacher_name,
    is_active: teacher.is_active,
    current_student_count: studentCountByTeacherId.get(teacher.id) ?? 0,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Teachers/Homerooms</h1>

        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Add and update the teacher/homeroom names used for the current school year. Students will pick from this list when submitting their club preferences.
        </p>

        {year ? (
          <p className="mt-1 text-sm text-slate-500">
            School year:{' '}
            <span className="font-medium text-slate-700">{year.label}</span>
          </p>
        ) : null}
      </div>

      <TeachersTableClient teachers={teacherRows} />
    </div>
  );
}
