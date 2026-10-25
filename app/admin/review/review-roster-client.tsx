'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addDraftAssignment, removeDraftAssignment } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Tone =
  | 'green'
  | 'yellow'
  | 'red'
  | 'orange'
  | 'blue'
  | 'slate'
  | 'purple';

type AssignedStudentRow = {
  assignment_id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  was_top_choice: boolean | null;
  fairness_boost: number | null;
  assignment_pass: number | null;
  priority_score: number | null;
  interest_score: number | null;
};

type AddableStudentRow = {
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  requested: number;
  assigned_count: number;
  unmet: number;
  current_clubs: string[];
  interest_score: number;
  is_top_choice: boolean;
};

type ClubRosterRow = {
  club_id: string;
  club_title: string;
  section_label: string | null;
  sponsor_name: string | null;
  leader_email: string | null;
  meeting_days: string[];
  capacity_type: string | null;
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  assigned_count: number;
  is_cancelled: boolean;
  is_force_run: boolean;
  is_below_minimum: boolean;
  is_at_capacity: boolean;
  is_over_capacity: boolean;
  assigned_students: AssignedStudentRow[];
  addable_students: AddableStudentRow[];
};

type SortKey =
  | 'club_title'
  | 'assigned_count'
  | 'capacity'
  | 'minimum'
  | 'status';

type SortDirection = 'asc' | 'desc';

type StatusFilter =
  | 'all'
  | 'needs_attention'
  | 'below_minimum'
  | 'at_capacity'
  | 'over_capacity'
  | 'cancelled'
  | 'force_run';

export function ReviewRosterClient({ clubs }: { clubs: ClubRosterRow[] }) {
  const [selectedClub, setSelectedClub] = useState<ClubRosterRow | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('club_title');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const filteredClubs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = clubs.filter((club) => {
      const haystack = [
        club.club_title,
        club.section_label,
        club.sponsor_name,
        club.leader_email,
        club.meeting_days.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (statusFilter === 'below_minimum' && !club.is_below_minimum) {
        return false;
      }

      if (statusFilter === 'at_capacity' && !club.is_at_capacity) {
        return false;
      }

      if (statusFilter === 'over_capacity' && !club.is_over_capacity) {
        return false;
      }

      if (statusFilter === 'cancelled' && !club.is_cancelled) {
        return false;
      }

      if (statusFilter === 'force_run' && !club.is_force_run) {
        return false;
      }

      if (
        statusFilter === 'needs_attention' &&
        !club.is_below_minimum &&
        !club.is_over_capacity &&
        !club.is_cancelled
      ) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let result = 0;

      if (sortKey === 'club_title') {
        result = displayClubName(a).localeCompare(displayClubName(b));
      } else if (sortKey === 'assigned_count') {
        result = a.assigned_count - b.assigned_count;
      } else if (sortKey === 'capacity') {
        result = capacitySortValue(a) - capacitySortValue(b);
      } else if (sortKey === 'minimum') {
        result =
          Number(a.minimum_viable_enrollment ?? 0) -
          Number(b.minimum_viable_enrollment ?? 0);
      } else {
        result = statusSortValue(a) - statusSortValue(b);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  }, [clubs, search, statusFilter, sortKey, sortDirection]);

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'status' ? 'desc' : 'asc');
  }

  function sortLabel(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function closeDrawer() {
    setSelectedClub(null);
  }

  const needsAttentionCount = clubs.filter(
    (club) => club.is_below_minimum || club.is_over_capacity || club.is_cancelled
  ).length;

  const atCapacityCount = clubs.filter((club) => club.is_at_capacity).length;
  const belowMinimumCount = clubs.filter((club) => club.is_below_minimum).length;
  const overCapacityCount = clubs.filter((club) => club.is_over_capacity).length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Club rosters</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Click a club to review or adjust its roster.
            </p>
          </div>

          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{clubs.length}</span>{' '}
            clubs ·{' '}
            <span className="font-medium text-slate-900">
              {needsAttentionCount}
            </span>{' '}
            to check
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <SummaryStat label="Full clubs" value={atCapacityCount} />
          <SummaryStat label="Small clubs" value={belowMinimumCount} />
          <SummaryStat label="Over capacity" value={overCapacityCount} />
          <SummaryStat label="To check" value={needsAttentionCount} />
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] lg:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search club, leader, or day"
          />

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All clubs</option>
            <option value="needs_attention">Needs a look</option>
            <option value="below_minimum">Small clubs</option>
            <option value="at_capacity">Full clubs</option>
            <option value="over_capacity">Over capacity</option>
            <option value="cancelled">Canceled</option>
            <option value="force_run">Will run</option>
          </select>

          <SortButton
            label={`Club${sortLabel('club_title')}`}
            onClick={() => toggleSort('club_title')}
          />

          <SortButton
            label={`Students${sortLabel('assigned_count')}`}
            onClick={() => toggleSort('assigned_count')}
          />

          <SortButton
            label={`Capacity${sortLabel('capacity')}`}
            onClick={() => toggleSort('capacity')}
          />

          <SortButton
            label={`Status${sortLabel('status')}`}
            onClick={() => toggleSort('status')}
          />
        </div>

        <div className="border-b px-4 py-3 text-sm text-slate-600">
          Showing{' '}
          <span className="font-medium text-slate-900">
            {filteredClubs.length}
          </span>{' '}
          of <span className="font-medium text-slate-900">{clubs.length}</span>{' '}
          clubs
        </div>

        {filteredClubs.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No clubs match your current filters.
          </div>
        ) : (
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {filteredClubs.map((club) => (
              <button
                key={club.club_id}
                type="button"
                onClick={() => setSelectedClub(club)}
                className={cardClassForClub(club)}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 text-left">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {displayClubName(club)}
                    </div>

                    <div className="mt-1 text-sm text-slate-600">
                      {club.meeting_days.length > 0
                        ? club.meeting_days.join(', ')
                        : 'No day set'}
                      {club.sponsor_name ? ` · ${club.sponsor_name}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {club.is_cancelled
                      ? statusBadge({ label: 'Canceled', tone: 'orange' })
                      : null}

                    {club.is_force_run
                      ? statusBadge({ label: 'Will run', tone: 'green' })
                      : null}

                    {club.is_below_minimum
                      ? statusBadge({ label: 'Small club', tone: 'yellow' })
                      : null}

                    {club.is_at_capacity
                      ? statusBadge({ label: 'Full', tone: 'purple' })
                      : null}

                    {club.is_over_capacity
                      ? statusBadge({ label: 'Over capacity', tone: 'red' })
                      : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-left text-sm sm:grid-cols-3">
                  <MiniStat label="Students" value={club.assigned_count} />
                  <MiniStat
                    label="Capacity"
                    value={
                      club.capacity_type === 'unlimited'
                        ? 'Unlimited'
                        : club.max_capacity ?? '—'
                    }
                  />
                  <MiniStat
                    label="Minimum"
                    value={club.minimum_viable_enrollment ?? 0}
                  />
                </div>

                <div className="mt-3 text-left text-xs text-slate-500">
                  Click to review this roster
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedClub ? (
        <Drawer title={displayClubName(selectedClub)} onClose={closeDrawer}>
          <ClubRosterDrawer club={selectedClub} onClose={closeDrawer} />
        </Drawer>
      ) : null}
    </div>
  );
}

function ClubRosterDrawer({
  club,
  onClose,
}: {
  club: ClubRosterRow;
  onClose: () => void;
}) {
  const sortedStudents = [...club.assigned_students].sort((a, b) =>
    String(a.student_name ?? '').localeCompare(String(b.student_name ?? ''))
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-slate-50 p-4">
        <div className="flex flex-wrap gap-2">
          {club.is_cancelled
            ? statusBadge({ label: 'Canceled', tone: 'orange' })
            : null}

          {club.is_force_run
            ? statusBadge({ label: 'Will run', tone: 'green' })
            : null}

          {club.is_below_minimum
            ? statusBadge({ label: 'Small club', tone: 'yellow' })
            : null}

          {club.is_at_capacity
            ? statusBadge({ label: 'Full', tone: 'purple' })
            : null}

          {club.is_over_capacity
            ? statusBadge({ label: 'Over capacity', tone: 'red' })
            : null}
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <DetailItem label="Students" value={club.assigned_count} />
          <DetailItem
            label="Capacity"
            value={
              club.capacity_type === 'unlimited'
                ? 'Unlimited'
                : club.max_capacity ?? '—'
            }
          />
          <DetailItem
            label="Minimum"
            value={club.minimum_viable_enrollment ?? 0}
          />
          <DetailItem
            label="Meeting days"
            value={club.meeting_days.length > 0 ? club.meeting_days.join(', ') : '—'}
          />
          <DetailItem label="Leader" value={club.sponsor_name ?? '—'} />
          <DetailItem label="Leader email" value={club.leader_email ?? '—'} />
        </div>
      </div>

      <AddStudentToClubForm club={club} onClose={onClose} />

      <div>
        <h3 className="mb-3 font-semibold">Students in this club</h3>

        {sortedStudents.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            No students are currently assigned to this club.
          </div>
        ) : (
          <div className="space-y-2">
            {sortedStudents.map((student) => (
              <StudentRosterCard
                key={student.assignment_id}
                student={student}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddStudentToClubForm({
  club,
  onClose,
}: {
  club: ClubRosterRow;
  onClose: () => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const selectedStudent = club.addable_students.find(
    (student) => student.student_id === selectedStudentId
  );

  async function handleAddAction(formData: FormData) {
    await addDraftAssignment(formData);
    onClose();
  }

  return (
    <details className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <summary className="cursor-pointer font-semibold text-blue-950">
        Add student
      </summary>

      <form action={handleAddAction} onSubmit={handleAddSubmit} className="mt-3 space-y-3">
        <input type="hidden" name="club_offering_id" value={club.club_id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-blue-950">
            Student
          </label>

          <select
            name="student_id"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            className="w-full rounded-xl border px-3 py-2 text-sm"
            required
          >
            <option value="">Choose student</option>
            {club.addable_students.map((student) => (
              <option key={student.student_id} value={student.student_id}>
                {student.student_name ?? 'Unknown student'} · Grade{' '}
                {student.grade ?? '—'} · assigned {student.assigned_count}/
                {student.requested}
                {' · '}{student.is_top_choice ? 'Top choice' : interestLabel(student.interest_score)}
              </option>
            ))}
          </select>

          {club.addable_students.length === 0 ? (
            <p className="mt-2 text-sm text-blue-900">
              No interested, grade-eligible students without a meeting-day conflict were found for this club.
            </p>
          ) : null}
        </div>

        {selectedStudent ? (
          <div className="rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-700">
            <div className="font-medium text-slate-900">
              {selectedStudent.student_name ?? 'Unknown student'}
            </div>

            <div className="mt-1">
              Grade {selectedStudent.grade ?? '—'} ·{' '}
              {selectedStudent.teacher_homeroom_text ?? 'No homeroom'}
            </div>

            <div className="mt-1">
              Wanted {selectedStudent.requested}; currently assigned{' '}
              {selectedStudent.assigned_count}; still wanted{' '}
              {selectedStudent.unmet}
            </div>

            <div className="mt-1">
              Current clubs:{' '}
              {selectedStudent.current_clubs.length > 0
                ? selectedStudent.current_clubs.join(', ')
                : 'None'}
            </div>
          </div>
        ) : null}

        <AddWarnings club={club} selectedStudent={selectedStudent} />

        <div>
          <label className="mb-1 block text-sm font-medium text-blue-950">
            Optional note
          </label>
          <Input
            name="reason"
            placeholder="Example: coordinator reviewed and added student"
          />
        </div>

        <p className="text-xs text-blue-900">
          This adds the student to the draft roster and saves the change in the
          roster history.
        </p>

        <Button type="submit">Add student</Button>
      </form>
    </details>
  );
}

function AddWarnings({
  club,
  selectedStudent,
}: {
  club: ClubRosterRow;
  selectedStudent: AddableStudentRow | undefined;
}) {
  if (!selectedStudent) return null;

  const warnings: string[] = [];

  if (
    club.capacity_type === 'limited' &&
    typeof club.max_capacity === 'number' &&
    club.assigned_count >= club.max_capacity
  ) {
    warnings.push(
      `This club is already full (${club.assigned_count}/${club.max_capacity}). Adding this student will put it over capacity.`
    );
  }

  if (selectedStudent.unmet <= 0) {
    warnings.push(
      'This student already has the number of clubs they asked for. Adding another club may give them more than requested.'
    );
  }

  if (warnings.length === 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        No major warnings found for this add.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
      <div className="font-semibold">Check before adding</div>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}

function StudentRosterCard({
  student,
  onClose,
}: {
  student: AssignedStudentRow;
  onClose: () => void;
}) {
  async function handleRemoveAction(formData: FormData) {
    await removeDraftAssignment(formData);
    onClose();
  }

  return (
    <div className="rounded-xl border bg-white p-3 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium text-slate-900">
            {student.student_name ?? 'Unknown student'}
          </div>

          <div className="mt-1 text-slate-500">
            Grade {student.grade ?? '—'} ·{' '}
            {student.teacher_homeroom_text ?? 'No homeroom'}
          </div>

          {student.student_email ? (
            <div className="mt-1 text-xs text-slate-500">
              {student.student_email}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {student.was_top_choice
            ? statusBadge({ label: 'Top choice', tone: 'green' })
            : null}

          {typeof student.interest_score === 'number'
            ? statusBadge({
                label: interestLabel(student.interest_score),
                tone: student.interest_score >= 2 ? 'blue' : 'slate',
              })
            : null}
        </div>
      </div>

      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Show matching details
        </summary>

        <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <MiniStat label="Round" value={student.assignment_pass ?? '—'} />
          <MiniStat
            label="Score"
            value={
              typeof student.priority_score === 'number'
                ? Number(student.priority_score).toFixed(1)
                : '—'
            }
          />
          <MiniStat
            label="Fairness"
            value={
              typeof student.fairness_boost === 'number'
                ? Number(student.fairness_boost).toFixed(1)
                : '—'
            }
          />
        </div>
      </details>

      <details className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-orange-900">
          Remove from this club
        </summary>

        <form
          action={handleRemoveAction}
          onSubmit={handleRemoveSubmit}
          className="mt-3 space-y-3"
        >
          <input type="hidden" name="assignment_id" value={student.assignment_id} />

          <div>
            <label className="mb-1 block text-sm font-medium text-orange-950">
              Optional note
            </label>
            <Input
              name="reason"
              placeholder="Example: coordinator reviewed and removed student"
            />
          </div>

          <p className="text-xs text-orange-900">
            This removes the student from this draft roster and saves the change
            in the roster history.
          </p>

          <Button type="submit" variant="destructive">
            Remove from club
          </Button>
        </form>
      </details>
    </div>
  );
}

function handleRemoveSubmit(event: FormEvent<HTMLFormElement>) {
  const confirmed = window.confirm(
    'Remove this student from this draft club roster? This change will be saved in the roster history.'
  );

  if (!confirmed) {
    event.preventDefault();
  }
}

function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
  const form = event.currentTarget;
  const formData = new FormData(form);
  const studentId = String(formData.get('student_id') ?? '').trim();

  if (!studentId) {
    event.preventDefault();
    window.alert('Please choose a student to add.');
    return;
  }

  const confirmed = window.confirm(
    'Add this student to this draft club roster? This change will be saved in the roster history.'
  );

  if (!confirmed) {
    event.preventDefault();
  }
}

function SortButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 font-medium text-slate-900">{value}</div>
    </div>
  );
}

function Drawer({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
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

      <div className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto bg-white shadow-xl">
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

function statusBadge({ label, tone }: { label: string; tone: Tone }) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50 text-yellow-900'
        : tone === 'red'
          ? 'border-red-200 bg-red-50 text-red-900'
          : tone === 'orange'
            ? 'border-orange-200 bg-orange-50 text-orange-900'
            : tone === 'blue'
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : tone === 'purple'
                ? 'border-purple-200 bg-purple-50 text-purple-900'
                : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function displayClubName(club: ClubRosterRow) {
  return [club.club_title, club.section_label].filter(Boolean).join(' — ');
}

function capacitySortValue(club: ClubRosterRow) {
  if (club.capacity_type === 'unlimited') return 9999;
  return Number(club.max_capacity ?? 0);
}

function statusSortValue(club: ClubRosterRow) {
  if (club.is_over_capacity) return 6;
  if (club.is_below_minimum) return 5;
  if (club.is_cancelled) return 4;
  if (club.is_force_run) return 3;
  if (club.is_at_capacity) return 2;
  return 1;
}

function cardClassForClub(club: ClubRosterRow) {
  const base =
    'w-full rounded-2xl border p-4 text-left transition hover:bg-blue-50';

  if (club.is_cancelled) {
    return `${base} border-orange-300 bg-orange-50`;
  }

  if (club.is_over_capacity) {
    return `${base} border-red-300 bg-red-50`;
  }

  if (club.is_below_minimum) {
    return `${base} border-yellow-300 bg-yellow-50`;
  }

  return `${base} bg-white`;
}

function interestLabel(score: number) {
  if (score >= 2) return 'Really wants this';
  if (score === 1) return 'Would try this';
  return 'Not interested';
}