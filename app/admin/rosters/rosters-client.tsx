"use client";

import { useMemo, useState } from 'react';
import { PrintButton } from '@/components/print-button';
import { Input } from '@/components/ui/input';

type RosterRow = {
  id: string;
  club_offering_id: string;
  student_id: string;
  student_name: string | null;
  grade: number | null;
  homeroom: string | null;
  club_title: string | null;
  section_label: string | null;
  leader_name: string | null;
  meeting_days: string[];
};

type ClubGroup = {
  clubId: string;
  clubName: string;
  leaderName: string | null;
  meetingDays: string[];
  students: RosterRow[];
};

type SortMode = 'club' | 'day' | 'size-desc' | 'size-asc';

function displayClubName(row: Pick<RosterRow, 'club_title' | 'section_label'>) {
  return [row.club_title, row.section_label].filter(Boolean).join(' — ') || 'Unknown club';
}

function displayMeetingDays(days: string[]) {
  return days.length > 0 ? days.join(', ') : 'No day set';
}

function gradeLabel(grade: number | null) {
  return grade ? `Grade ${grade}` : 'Grade —';
}

export function RostersClient({
  rows,
  schoolYearLabel,
  blockLabel,
}: {
  rows: RosterRow[];
  schoolYearLabel: string;
  blockLabel: string;
}) {
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('club');

  const allDays = useMemo(() => {
    return Array.from(new Set(rows.flatMap((row) => row.meeting_days))).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      const clubName = displayClubName(row);
      const haystack = [
        row.student_name,
        row.homeroom,
        row.leader_name,
        clubName,
        row.meeting_days.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (gradeFilter !== 'all' && String(row.grade) !== gradeFilter) return false;
      if (dayFilter !== 'all' && !row.meeting_days.includes(dayFilter)) return false;

      return true;
    });
  }, [rows, search, gradeFilter, dayFilter]);

  const clubGroups = useMemo(() => {
    const groups = new Map<string, ClubGroup>();

    for (const row of filteredRows) {
      const clubId = row.club_offering_id;
      const existing = groups.get(clubId);

      if (existing) {
        existing.students.push(row);
      } else {
        groups.set(clubId, {
          clubId,
          clubName: displayClubName(row),
          leaderName: row.leader_name,
          meetingDays: row.meeting_days,
          students: [row],
        });
      }
    }

    const sorted = Array.from(groups.values()).map((group) => ({
      ...group,
      students: [...group.students].sort((a, b) =>
        String(a.student_name ?? '').localeCompare(String(b.student_name ?? ''))
      ),
    }));

    sorted.sort((a, b) => {
      if (sortMode === 'size-desc') return b.students.length - a.students.length;
      if (sortMode === 'size-asc') return a.students.length - b.students.length;
      if (sortMode === 'day') {
        const aDay = a.meetingDays[0] ?? '';
        const bDay = b.meetingDays[0] ?? '';
        const dayCompare = aDay.localeCompare(bDay);
        if (dayCompare !== 0) return dayCompare;
      }

      return a.clubName.localeCompare(b.clubName);
    });

    return sorted;
  }, [filteredRows, sortMode]);

  const matchingStudents = useMemo(() => {
    const studentMap = new Map<string, RosterRow[]>();
    const query = search.trim().toLowerCase();

    if (!query) return [];

    for (const row of rows) {
      const studentText = [row.student_name, row.homeroom, row.student_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!studentText.includes(query)) continue;

      const existing = studentMap.get(row.student_id) ?? [];
      existing.push(row);
      studentMap.set(row.student_id, existing);
    }

    return Array.from(studentMap.entries())
      .map(([studentId, assignments]) => ({
        studentId,
        studentName: assignments[0]?.student_name ?? 'Unknown student',
        grade: assignments[0]?.grade ?? null,
        homeroom: assignments[0]?.homeroom ?? null,
        assignments: assignments.sort((a, b) =>
          displayClubName(a).localeCompare(displayClubName(b))
        ),
      }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName))
      .slice(0, 12);
  }, [rows, search]);

  const totalStudents = new Set(rows.map((row) => row.student_id)).size;
  const filteredStudents = new Set(filteredRows.map((row) => row.student_id)).size;
  const totalClubs = new Set(rows.map((row) => row.club_offering_id)).size;
  const filtersAreActive = search.trim() || gradeFilter !== 'all' || dayFilter !== 'all';

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Print Rosters</h1>
          <p className="mt-1 text-sm text-slate-600">
            Print finalized club rosters for the current session.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {schoolYearLabel} · {blockLabel}
          </p>
        </div>

        <PrintButton />
      </div>

      <div className="no-print grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Clubs
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totalClubs}</div>
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Students on rosters
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totalStudents}</div>
        </div>

        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Showing now
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {filteredStudents}
          </div>
        </div>
      </div>

      <div className="no-print rounded-2xl border bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, club, leader, or homeroom"
          />

          <select
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All grades</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>

          <select
            value={dayFilter}
            onChange={(event) => setDayFilter(event.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All days</option>
            {allDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="club">Sort by club</option>
            <option value="day">Sort by day</option>
            <option value="size-desc">Largest rosters first</option>
            <option value="size-asc">Smallest rosters first</option>
          </select>
        </div>

        {matchingStudents.length > 0 ? (
          <div className="mt-4 rounded-xl border bg-blue-50 p-3">
            <div className="text-sm font-semibold text-blue-950">Student lookup</div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {matchingStudents.map((student) => (
                <div key={student.studentId} className="rounded-xl border bg-white p-3 text-sm">
                  <div className="font-medium text-slate-900">{student.studentName}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {gradeLabel(student.grade)} · {student.homeroom ?? 'No homeroom'}
                  </div>
                  <div className="mt-2 text-slate-700">
                    {student.assignments.map((assignment) => displayClubName(assignment)).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {filtersAreActive ? (
          <div className="mt-3 text-sm text-slate-600">
            Showing {clubGroups.length} club{clubGroups.length === 1 ? '' : 's'} and{' '}
            {filteredStudents} student{filteredStudents === 1 ? '' : 's'} based on your filters.
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
          No finalized rosters found for the current session. Finalize rosters before printing.
        </div>
      ) : clubGroups.length === 0 ? (
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
          No rosters match your current filters.
        </div>
      ) : (
        clubGroups.map((group) => (
          <section
            key={group.clubId}
            className="break-after-page rounded-2xl border bg-white p-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">{group.clubName}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {group.leaderName ?? 'No leader listed'} ·{' '}
                  {displayMeetingDays(group.meetingDays)}
                </p>
              </div>

              <div className="rounded-full border bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                {group.students.length} student{group.students.length === 1 ? '' : 's'}
              </div>
            </div>

            <table className="mt-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-600">
                  <th className="p-2 font-medium">Student</th>
                  <th className="p-2 font-medium">Grade</th>
                  <th className="p-2 font-medium">Homeroom</th>
                </tr>
              </thead>

              <tbody>
                {group.students.map((assignment) => (
                  <tr key={assignment.id} className="border-b">
                    <td className="p-2 font-medium text-slate-900">
                      {assignment.student_name ?? 'Unknown student'}
                    </td>
                    <td className="p-2 text-slate-700">{gradeLabel(assignment.grade)}</td>
                    <td className="p-2 text-slate-700">{assignment.homeroom ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
