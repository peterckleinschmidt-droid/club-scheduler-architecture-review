"use client";

import { useMemo, useState } from 'react';
import { updateStudentRegistry } from './mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

type SortKey =
  | 'student_name'
  | 'student_email'
  | 'grade'
  | 'teacher_homeroom_text'
  | 'is_active';

type SortDirection = 'asc' | 'desc';
type GradeFilter = 'all' | '3' | '4' | '5';
type StudentStatusFilter = 'all' | 'included' | 'not-included';

export function StudentsTableClient({
  students,
  teachers,
}: {
  students: StudentRow[];
  teachers: TeacherRow[];
}) {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [studentStatusFilter, setStudentStatusFilter] =
    useState<StudentStatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('student_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(
    null
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = students.filter((student) => {
      const haystack = [
        student.student_name,
        student.student_email,
        student.teacher_homeroom_text,
        student.teacher_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (gradeFilter !== 'all' && String(student.grade) !== gradeFilter) {
        return false;
      }

      if (studentStatusFilter === 'included' && student.is_active === false) {
        return false;
      }

      if (studentStatusFilter === 'not-included' && student.is_active !== false) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let result = 0;

      if (sortKey === 'student_name') {
        result = String(a.student_name ?? '').localeCompare(
          String(b.student_name ?? '')
        );
      } else if (sortKey === 'student_email') {
        result = String(a.student_email ?? '').localeCompare(
          String(b.student_email ?? '')
        );
      } else if (sortKey === 'grade') {
        result = Number(a.grade ?? 0) - Number(b.grade ?? 0);
      } else if (sortKey === 'teacher_homeroom_text') {
        result = String(
          a.teacher_homeroom_text ?? a.teacher_name ?? ''
        ).localeCompare(String(b.teacher_homeroom_text ?? b.teacher_name ?? ''));
      } else {
        const aIncluded = a.is_active === false ? 0 : 1;
        const bIncluded = b.is_active === false ? 0 : 1;
        result = aIncluded - bIncluded;
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  }, [students, search, gradeFilter, studentStatusFilter, sortKey, sortDirection]);

  const includedCount = students.filter((student) => student.is_active !== false)
    .length;
  const notIncludedCount = students.length - includedCount;

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection('asc');
  }

  function sortLabel(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function confirmDiscardIfNeeded() {
    if (!hasUnsavedChanges) return true;

    return window.confirm(
      'You have unsaved changes. Discard those changes and close?'
    );
  }

  function closeDrawer() {
    if (!confirmDiscardIfNeeded()) return;

    setSelectedStudent(null);
    setHasUnsavedChanges(false);
  }

  function openStudent(student: StudentRow) {
    if (!confirmDiscardIfNeeded()) return;

    setSelectedStudent(student);
    setHasUnsavedChanges(false);
  }

  function markSaving() {
    setHasUnsavedChanges(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">Student list</h2>
            <p className="mt-1 text-sm text-slate-600">
              Search students and click a row to update name, grade, or homeroom.
            </p>
          </div>

          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{students.length}</span>{' '}
            total ·{' '}
            <span className="font-medium text-slate-900">{includedCount}</span>{' '}
            included ·{' '}
            <span className="font-medium text-slate-900">{notIncludedCount}</span>{' '}
            not included
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, or homeroom"
          />

          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value as GradeFilter)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All grades</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>

          <select
            value={studentStatusFilter}
            onChange={(event) =>
              setStudentStatusFilter(event.target.value as StudentStatusFilter)
            }
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All students</option>
            <option value="included">Included in scheduling</option>
            <option value="not-included">Not included</option>
          </select>
        </div>

        <div className="border-b px-4 py-3 text-sm text-slate-600">
          Showing{' '}
          <span className="font-medium text-slate-900">
            {filteredStudents.length}
          </span>{' '}
          of <span className="font-medium text-slate-900">{students.length}</span>{' '}
          students
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No students match your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('student_name')}
                      className="font-medium hover:text-slate-900"
                    >
                      Student{sortLabel('student_name')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('student_email')}
                      className="font-medium hover:text-slate-900"
                    >
                      Email{sortLabel('student_email')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('grade')}
                      className="font-medium hover:text-slate-900"
                    >
                      Grade{sortLabel('grade')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('teacher_homeroom_text')}
                      className="font-medium hover:text-slate-900"
                    >
                      Homeroom{sortLabel('teacher_homeroom_text')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('is_active')}
                      className="font-medium hover:text-slate-900"
                    >
                      Scheduling{sortLabel('is_active')}
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredStudents.map((student) => (
                  <tr
                    key={student.id}
                    onClick={() => openStudent(student)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {student.student_name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {student.student_email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {student.grade ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {student.teacher_homeroom_text ??
                        student.teacher_name ??
                        '—'}
                    </td>
                    <td className="px-4 py-3">
                      {student.is_active === false ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                          Not included
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                          Included
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedStudent ? (
        <Drawer title="Edit student" onClose={closeDrawer}>
          <form
            action={updateStudentRegistry}
            onChange={() => setHasUnsavedChanges(true)}
            onSubmit={markSaving}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={selectedStudent.id} />

            <div>
              <label className="mb-1 block text-sm font-medium">
                Student name
              </label>
              <Input
                name="student_name"
                defaultValue={selectedStudent.student_name}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <Input
                value={selectedStudent.student_email ?? ''}
                disabled
                className="bg-slate-50"
              />
              <p className="mt-1 text-xs text-slate-500">
                Email is set by student sign-in and cannot be edited here.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Grade</label>
              <select
                name="grade"
                defaultValue={String(selectedStudent.grade ?? '')}
                className="w-full rounded-xl border px-3 py-2"
                required
              >
                <option value="" disabled>
                  Choose grade
                </option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Homeroom
              </label>
              <select
                name="teacher_id"
                defaultValue={selectedStudent.teacher_id ?? ''}
                className="w-full rounded-xl border px-3 py-2"
              >
                <option value="">No homeroom selected</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.teacher_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                Homeroom display name
              </label>
              <Input
                name="teacher_homeroom_text"
                defaultValue={
                  selectedStudent.teacher_homeroom_text ??
                  selectedStudent.teacher_name ??
                  ''
                }
                placeholder="Example: Smith/Jones or The Caitlins"
              />
              <p className="mt-1 text-xs text-slate-500">
                This is the homeroom name shown on rosters.
              </p>
            </div>

            <label className="flex items-center gap-2 rounded-xl border bg-slate-50 p-3 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={selectedStudent.is_active !== false}
              />
              Include this student in scheduling
            </label>

            {hasUnsavedChanges ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                You have unsaved changes.
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit">Save changes</Button>
              <Button type="button" variant="outline" onClick={closeDrawer}>
                Cancel
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}
    </div>
  );
}

function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close drawer"
        className="absolute inset-0 bg-slate-900/30"
        onClick={onClose}
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
