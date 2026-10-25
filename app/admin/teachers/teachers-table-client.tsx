"use client";

import { useMemo, useState, type FormEvent } from 'react';
import { addTeacher, updateTeacher, deleteTeacher } from './mutations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type TeacherRow = {
  id: string;
  teacher_name: string;
  is_active?: boolean | null;
  current_student_count?: number;
};

type SortKey = 'teacher_name' | 'current_student_count';
type SortDirection = 'asc' | 'desc';

export function TeachersTableClient({ teachers }: { teachers: TeacherRow[] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('teacher_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherRow | null>(
    null
  );
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredTeachers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = teachers.filter((teacher) => {
      if (!query) return true;
      return teacher.teacher_name.toLowerCase().includes(query);
    });

    filtered.sort((a, b) => {
      let result = 0;

      if (sortKey === 'teacher_name') {
        result = a.teacher_name.localeCompare(b.teacher_name);
      } else {
        result =
          (a.current_student_count ?? 0) - (b.current_student_count ?? 0);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  }, [teachers, search, sortKey, sortDirection]);

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

  function closeDrawers() {
    if (!confirmDiscardIfNeeded()) return;

    setSelectedTeacher(null);
    setShowAddDrawer(false);
    setHasUnsavedChanges(false);
  }

  function openAddDrawer() {
    if (!confirmDiscardIfNeeded()) return;

    setSelectedTeacher(null);
    setShowAddDrawer(true);
    setHasUnsavedChanges(false);
  }

  function openEditDrawer(teacher: TeacherRow) {
    if (!confirmDiscardIfNeeded()) return;

    setShowAddDrawer(false);
    setSelectedTeacher(teacher);
    setHasUnsavedChanges(false);
  }

  function markSaving() {
    setHasUnsavedChanges(false);
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    const currentCount = selectedTeacher?.current_student_count ?? 0;

    const confirmed = window.confirm(
      currentCount > 0
        ? 'This homeroom still has current-year students assigned and cannot be deleted yet.'
        : 'Delete this homeroom? Past student records will keep their saved homeroom text, but this homeroom will no longer appear as an option.'
    );

    if (!confirmed || currentCount > 0) {
      event.preventDefault();
    }
  }

  async function handleDeleteAction(formData: FormData) {
    setIsDeleting(true);

    try {
      await deleteTeacher(formData);
      setSelectedTeacher(null);
      setShowAddDrawer(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not delete homeroom.';

      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold">Homerooms</h2>
          <p className="mt-1 text-sm text-slate-600">
            Search homerooms and click a row to edit the display name.
          </p>
        </div>

        <Button type="button" onClick={openAddDrawer}>
          Add homeroom
        </Button>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-600">
            Showing{' '}
            <span className="font-medium text-slate-900">
              {filteredTeachers.length}
            </span>{' '}
            of{' '}
            <span className="font-medium text-slate-900">
              {teachers.length}
            </span>{' '}
            homerooms
          </div>

          <div className="w-full md:max-w-sm">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search homeroom"
            />
          </div>
        </div>

        {filteredTeachers.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No homerooms match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('teacher_name')}
                      className="font-medium hover:text-slate-900"
                    >
                      Homeroom{sortLabel('teacher_name')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => toggleSort('current_student_count')}
                      className="font-medium hover:text-slate-900"
                    >
                      Current students{sortLabel('current_student_count')}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">Scheduling</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredTeachers.map((teacher) => (
                  <tr
                    key={teacher.id}
                    onClick={() => openEditDrawer(teacher)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {teacher.teacher_name}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {teacher.current_student_count ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      {teacher.is_active === false ? (
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

      {showAddDrawer ? (
        <Drawer title="Add homeroom" onClose={closeDrawers}>
          <form
            action={addTeacher}
            onChange={() => setHasUnsavedChanges(true)}
            onSubmit={markSaving}
            className="space-y-4"
          >
            <div>
              <label className="mb-1 block text-sm font-medium">
                Homeroom name
              </label>
              <Input
                name="teacher_name"
                placeholder="Example: Smith, Smith/Jones, or The Caitlins"
                required
              />
            </div>

            {hasUnsavedChanges ? (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                You have unsaved changes.
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit">Add homeroom</Button>
              <Button type="button" variant="outline" onClick={closeDrawers}>
                Cancel
              </Button>
            </div>
          </form>
        </Drawer>
      ) : null}

      {selectedTeacher ? (
        <Drawer title="Edit homeroom" onClose={closeDrawers}>
          <div className="space-y-6">
            <form
              action={updateTeacher}
              onChange={() => setHasUnsavedChanges(true)}
              onSubmit={markSaving}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={selectedTeacher.id} />

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Homeroom name
                </label>
                <Input
                  name="teacher_name"
                  defaultValue={selectedTeacher.teacher_name}
                  required
                />
              </div>

              <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                Current-year students assigned to this homeroom:{' '}
                <span className="font-medium">
                  {selectedTeacher.current_student_count ?? 0}
                </span>
              </div>

              {hasUnsavedChanges ? (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
                  You have unsaved changes.
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button type="submit">Save changes</Button>
                <Button type="button" variant="outline" onClick={closeDrawers}>
                  Cancel
                </Button>
              </div>
            </form>

            <div className="border-t pt-4">
              <div className="mb-2 text-sm font-medium text-slate-900">
                Delete homeroom
              </div>
              <p className="mb-3 text-sm text-slate-600">
                Deleting is blocked when current-year students are assigned
                to this homeroom.
              </p>

              <form action={handleDeleteAction} onSubmit={handleDeleteSubmit}>
                <input type="hidden" name="id" value={selectedTeacher.id} />
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={isDeleting || (selectedTeacher.current_student_count ?? 0) > 0}
                >
                  {isDeleting ? 'Deleting...' : 'Delete homeroom'}
                </Button>
              </form>
            </div>
          </div>
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

      <div className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl">
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
