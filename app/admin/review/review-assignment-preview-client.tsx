'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type AssignmentPreviewRow = {
  assignment_id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  club_offering_id: string;
  club_title: string | null;
  section_label: string | null;
  was_top_choice: boolean | null;
  interest_score: number | null;
  fairness_boost: number | null;
  priority_score: number | null;
  assignment_pass: number | null;
  is_cancelled_assignment: boolean;
};

type SortKey =
  | 'student_name'
  | 'grade'
  | 'teacher_homeroom_text'
  | 'club_title'
  | 'assignment_pass'
  | 'interest_score'
  | 'fairness_boost'
  | 'priority_score';

type SortDirection = 'asc' | 'desc';
type GradeFilter = 'all' | '3' | '4' | '5';

type StatusFilter =
  | 'all'
  | 'cancelled'
  | 'active'
  | 'top_choice'
  | 'not_top_choice';

export function ReviewAssignmentPreviewClient({
  assignments,
}: {
  assignments: AssignmentPreviewRow[];
}) {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('student_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = assignments.filter((assignment) => {
      const haystack = [
        assignment.student_name,
        assignment.student_email,
        assignment.teacher_homeroom_text,
        assignment.club_title,
        assignment.section_label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (gradeFilter !== 'all' && String(assignment.grade) !== gradeFilter) {
        return false;
      }

      if (statusFilter === 'cancelled' && !assignment.is_cancelled_assignment) {
        return false;
      }

      if (statusFilter === 'active' && assignment.is_cancelled_assignment) {
        return false;
      }

      if (statusFilter === 'top_choice' && !assignment.was_top_choice) {
        return false;
      }

      if (statusFilter === 'not_top_choice' && assignment.was_top_choice) {
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
      } else if (sortKey === 'grade') {
        result = Number(a.grade ?? 0) - Number(b.grade ?? 0);
      } else if (sortKey === 'teacher_homeroom_text') {
        result = String(a.teacher_homeroom_text ?? '').localeCompare(
          String(b.teacher_homeroom_text ?? '')
        );
      } else if (sortKey === 'club_title') {
        result = displayClubName(a).localeCompare(displayClubName(b));
      } else if (sortKey === 'assignment_pass') {
        result = Number(a.assignment_pass ?? 0) - Number(b.assignment_pass ?? 0);
      } else if (sortKey === 'interest_score') {
        result = Number(a.interest_score ?? -1) - Number(b.interest_score ?? -1);
      } else if (sortKey === 'fairness_boost') {
        result = Number(a.fairness_boost ?? 0) - Number(b.fairness_boost ?? 0);
      } else {
        result = Number(a.priority_score ?? 0) - Number(b.priority_score ?? 0);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  }, [assignments, search, gradeFilter, statusFilter, sortKey, sortDirection]);

  const cancelledCount = assignments.filter(
    (assignment) => assignment.is_cancelled_assignment
  ).length;

  const topChoiceCount = assignments.filter(
    (assignment) => assignment.was_top_choice
  ).length;

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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Assignment details</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use this if you need to search or sort the full draft roster list.
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <SummaryStat label="Draft roster spots" value={assignments.length} />
          <SummaryStat label="Top-choice spots" value={topChoiceCount} />
          <SummaryStat label="Canceled club spots" value={cancelledCount} />
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] lg:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, homeroom, or club"
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
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as StatusFilter)
            }
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All roster spots</option>
            <option value="active">Active roster spots</option>
            <option value="cancelled">Canceled club spots</option>
            <option value="top_choice">Top choice</option>
            <option value="not_top_choice">Not top choice</option>
          </select>

          <SortButton
            label={`Student${sortLabel('student_name')}`}
            onClick={() => toggleSort('student_name')}
          />

          <SortButton
            label={`Club${sortLabel('club_title')}`}
            onClick={() => toggleSort('club_title')}
          />

          <SortButton
            label={`Score${sortLabel('priority_score')}`}
            onClick={() => toggleSort('priority_score')}
          />
        </div>

        <div className="border-b px-4 py-3 text-sm text-slate-600">
          Showing{' '}
          <span className="font-medium text-slate-900">
            {filteredAssignments.length}
          </span>{' '}
          of{' '}
          <span className="font-medium text-slate-900">
            {assignments.length}
          </span>{' '}
          roster spots
        </div>

        {filteredAssignments.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No roster spots match your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <HeaderButton
                    label={`Student${sortLabel('student_name')}`}
                    onClick={() => toggleSort('student_name')}
                  />
                  <HeaderButton
                    label={`Grade${sortLabel('grade')}`}
                    onClick={() => toggleSort('grade')}
                  />
                  <HeaderButton
                    label={`Homeroom${sortLabel('teacher_homeroom_text')}`}
                    onClick={() => toggleSort('teacher_homeroom_text')}
                  />
                  <HeaderButton
                    label={`Club${sortLabel('club_title')}`}
                    onClick={() => toggleSort('club_title')}
                  />
                  <HeaderButton
                    label={`Round${sortLabel('assignment_pass')}`}
                    onClick={() => toggleSort('assignment_pass')}
                  />
                  <HeaderButton
                    label={`Interest${sortLabel('interest_score')}`}
                    onClick={() => toggleSort('interest_score')}
                  />
                  <HeaderButton
                    label={`Fairness${sortLabel('fairness_boost')}`}
                    onClick={() => toggleSort('fairness_boost')}
                  />
                  <HeaderButton
                    label={`Score${sortLabel('priority_score')}`}
                    onClick={() => toggleSort('priority_score')}
                  />
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredAssignments.map((assignment) => (
                  <tr
                    key={assignment.assignment_id}
                    className={
                      assignment.is_cancelled_assignment
                        ? 'bg-orange-50'
                        : 'hover:bg-slate-50'
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {assignment.student_name ?? 'Unknown student'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {assignment.student_email ?? ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {assignment.grade ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {assignment.teacher_homeroom_text ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {displayClubName(assignment)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {assignment.assignment_pass ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {interestLabel(assignment.interest_score)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {typeof assignment.fairness_boost === 'number'
                        ? Number(assignment.fairness_boost).toFixed(1)
                        : '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {typeof assignment.priority_score === 'number'
                        ? Number(assignment.priority_score).toFixed(1)
                        : '—'}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {assignment.was_top_choice ? (
                          <Badge label="Top choice" tone="green" />
                        ) : null}

                        {assignment.is_cancelled_assignment ? (
                          <Badge label="Canceled club" tone="orange" />
                        ) : (
                          <Badge label="Active" tone="blue" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function HeaderButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={onClick}
        className="font-medium hover:text-slate-900"
      >
        {label}
      </button>
    </th>
  );
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

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'green' | 'orange' | 'blue' | 'slate';
}) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'orange'
        ? 'border-orange-200 bg-orange-50 text-orange-900'
        : tone === 'blue'
          ? 'border-blue-200 bg-blue-50 text-blue-900'
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span
      className={`rounded-full border px-2 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function displayClubName(assignment: AssignmentPreviewRow) {
  return (
    [assignment.club_title, assignment.section_label]
      .filter(Boolean)
      .join(' — ') || 'Unknown club'
  );
}

function interestLabel(score: number | null) {
  if (score === null || score === undefined) return '—';
  if (score >= 2) return 'Really wants this';
  if (score === 1) return 'Would try this';
  return 'Not interested';
}