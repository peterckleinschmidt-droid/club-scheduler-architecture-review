import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { StudentsTableClient } from './students-table-client';

type TeacherRow = {
  id: string;
  teacher_name: string;
};

type StudentRow = {
  id: string;
  student_name: string;
  student_email: string | null;
  grade: number | null;
  teacher_id: string | null;
  teacher_homeroom_text: string | null;
  is_active: boolean | null;
  teacher_name: string | null;
};

export default async function StudentRegistryPage() {
  const supabase = await createClient();
  const { year } = await getActiveContext();

  if (!year) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Students</h1>

          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Review and update the student list for club scheduling.
          </p>
        </div>

        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          No current school year is set. Choose a school year before reviewing
          students.
        </div>
      </div>
    );
  }

  const [{ data: students = [] }, { data: teachers = [] }] = await Promise.all([
    supabase
      .from('students')
      .select('*, teachers(teacher_name)')
      .eq('school_year_id', year.id)
      .order('student_name', { ascending: true }),
    supabase
      .from('teachers')
      .select('id, teacher_name')
      .order('teacher_name', { ascending: true }),
  ]);

  const studentRows: StudentRow[] = (students as any[]).map((student) => ({
    id: student.id,
    student_name: student.student_name,
    student_email: student.student_email,
    grade: student.grade,
    teacher_id: student.teacher_id,
    teacher_homeroom_text: student.teacher_homeroom_text,
    is_active: student.is_active,
    teacher_name: student.teachers?.teacher_name ?? null,
  }));

  const teacherRows: TeacherRow[] = (teachers as any[]).map((teacher) => ({
    id: teacher.id,
    teacher_name: teacher.teacher_name,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Students</h1>

        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Review student names, grades, and homerooms for the current school
          year.
        </p>

        <p className="mt-1 text-sm text-slate-500">
          School year:{' '}
          <span className="font-medium text-slate-700">{year.label}</span>
        </p>
      </div>

      <StudentsTableClient students={studentRows} teachers={teacherRows} />
    </div>
  );
}