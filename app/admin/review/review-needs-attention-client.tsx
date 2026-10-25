'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  addDraftAssignment,
  markStudentNeedsAttentionAddressed,
} from './actions';
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

type CurrentClubRow = {
  club_offering_id: string;
  club_title: string | null;
  section_label: string | null;
  meeting_days: string[];
};

type InterestedClubRow = {
  club_offering_id: string;
  club_title: string | null;
  section_label: string | null;
  sponsor_name: string | null;
  meeting_days: string[];
  capacity_type: string | null;
  max_capacity: number | null;
  assigned_count: number;
  minimum_viable_enrollment: number | null;
  interest_score: number;
  interest_level: string | null;
  is_top_choice: boolean;
  is_already_assigned: boolean;
};

type NeedsAttentionStudentRow = {
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  requested: number;
  assigned_count: number;
  unmet: number;
  got_top_choice?: boolean;
  got_high_interest_club?: boolean;
  high_interest_requested_count?: number;
  high_interest_assigned_count?: number;
  attention_reason?: string | null;
  attention_detail?: string | null;
  is_addressed: boolean;
  current_clubs: CurrentClubRow[];
  interested_clubs: InterestedClubRow[];
};

type SortKey =
  | 'student_name'
  | 'grade'
  | 'teacher_homeroom_text'
  | 'requested'
  | 'assigned_count'
  | 'unmet'
  | 'reason'
  | 'addressed';

type SortDirection = 'asc' | 'desc';
type GradeFilter = 'all' | '3' | '4' | '5';

type StatusFilter =
  | 'all'
  | 'unaddressed'
  | 'addressed'
  | 'zero_clubs'
  | 'no_high_interest';

export function ReviewNeedsAttentionClient({
  students,
}: {
  students: NeedsAttentionStudentRow[];
}) {
  const [selectedStudent, setSelectedStudent] =
    useState<NeedsAttentionStudentRow | null>(null);

  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('addressed');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = students.filter((student) => {
      const currentClubs = Array.isArray(student.current_clubs)
        ? student.current_clubs
        : [];

      const interestedClubs = Array.isArray(student.interested_clubs)
        ? student.interested_clubs
        : [];

      const haystack = [
        student.student_name,
        student.student_email,
        student.teacher_homeroom_text,
        student.attention_reason,
        student.attention_detail,
        currentClubs.map((club) => displayClubName(club)).join(' '),
        interestedClubs.map((club) => displayClubName(club)).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (gradeFilter !== 'all' && String(student.grade) !== gradeFilter) {
        return false;
      }

      if (statusFilter === 'unaddressed' && student.is_addressed) return false;
      if (statusFilter === 'addressed' && !student.is_addressed) return false;
      if (statusFilter === 'zero_clubs' && student.assigned_count !== 0) return false;

      if (
        statusFilter === 'no_high_interest' &&
        student.attention_reason !== 'No high-interest club assigned'
      ) {
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
      } else if (sortKey === 'requested') {
        result = a.requested - b.requested;
      } else if (sortKey === 'assigned_count') {
        result = a.assigned_count - b.assigned_count;
      } else if (sortKey === 'unmet') {
        result = a.unmet - b.unmet;
      } else if (sortKey === 'reason') {
        result = reasonPriority(b) - reasonPriority(a);
      } else {
        result = Number(a.is_addressed) - Number(b.is_addressed);
      }

      return sortDirection === 'asc' ? result : -result;
    });

    return filtered;
  }, [students, search, gradeFilter, statusFilter, sortKey, sortDirection]);

  const zeroClubCount = students.filter(
    (student) => student.assigned_count === 0
  ).length;

  const noHighInterestCount = students.filter(
    (student) => student.attention_reason === 'No high-interest club assigned'
  ).length;

  const addressedCount = students.filter((student) => student.is_addressed).length;
  const unaddressedCount = students.length - addressedCount;

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(
      nextSortKey === 'unmet' || nextSortKey === 'reason' ? 'desc' : 'asc'
    );
  }

  function sortLabel(key: SortKey) {
    if (key !== sortKey) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }

  function closeDrawer() {
    setSelectedStudent(null);
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Students who need help</h2>
        <p className="mt-1 text-sm text-slate-600">
          These students may need a quick look before rosters are finalized.
        </p>

        <details className="mt-2 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">
            Why are these students listed?
          </summary>
          <p className="mt-2 max-w-3xl">
            Students appear here if they asked for a club but did not get one,
            or if they marked a club as high interest but did not receive any
            high-interest club.
          </p>
        </details>
      </div>

      <div className="rounded-2xl border bg-white p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <SummaryStat label="Need help" value={students.length} />
          <SummaryStat label="Still needs help" value={unaddressedCount} />
          <SummaryStat label="No club" value={zeroClubCount} />
          <SummaryStat label="No high-interest match" value={noHighInterestCount} />
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] lg:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search student, homeroom, reason, or club"
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
            <option value="all">All</option>
            <option value="unaddressed">Still needs help</option>
            <option value="addressed">Reviewed</option>
            <option value="zero_clubs">No club</option>
            <option value="no_high_interest">No high-interest match</option>
          </select>

          <SortButton
            label={`Student${sortLabel('student_name')}`}
            onClick={() => toggleSort('student_name')}
          />

          <SortButton
            label={`Reason${sortLabel('reason')}`}
            onClick={() => toggleSort('reason')}
          />

          <SortButton
            label={`Reviewed${sortLabel('addressed')}`}
            onClick={() => toggleSort('addressed')}
          />
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
                    label={`Reason${sortLabel('reason')}`}
                    onClick={() => toggleSort('reason')}
                  />

                  <HeaderButton
                    label={`Wanted${sortLabel('requested')}`}
                    onClick={() => toggleSort('requested')}
                  />

                  <HeaderButton
                    label={`Assigned${sortLabel('assigned_count')}`}
                    onClick={() => toggleSort('assigned_count')}
                  />

                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredStudents.map((student) => (
                  <tr
                    key={student.student_id}
                    onClick={() => setSelectedStudent(student)}
                    className={
                      student.is_addressed
                        ? 'cursor-pointer bg-green-50 hover:bg-green-100'
                        : 'cursor-pointer hover:bg-blue-50'
                    }
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {student.student_name ?? 'Unknown student'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {student.student_email ?? ''}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {student.grade ?? '—'}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {student.teacher_homeroom_text ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      <AttentionReasonBadge student={student} />
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {student.requested}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {student.assigned_count}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {student.assigned_count === 0 ? (
                          <Badge label="No club" tone="red" />
                        ) : null}

                        {student.got_high_interest_club ? (
                          <Badge label="Got high-interest club" tone="green" />
                        ) : student.attention_reason ===
                          'No high-interest club assigned' ? (
                          <Badge label="No high-interest match" tone="orange" />
                        ) : null}

                        {student.is_addressed ? (
                          <Badge label="Reviewed" tone="green" />
                        ) : (
                          <Badge label="Still needs help" tone="yellow" />
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

      {selectedStudent ? (
        <Drawer
          title={selectedStudent.student_name ?? 'Student detail'}
          onClose={closeDrawer}
        >
          <NeedsAttentionDrawer student={selectedStudent} onClose={closeDrawer} />
        </Drawer>
      ) : null}
    </section>
  );
}

function NeedsAttentionDrawer({
  student,
  onClose,
}: {
  student: NeedsAttentionStudentRow;
  onClose: () => void;
}) {
  const currentClubs = Array.isArray(student.current_clubs)
    ? student.current_clubs
    : [];

  const interestedClubs = Array.isArray(student.interested_clubs)
    ? student.interested_clubs
    : [];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-slate-50 p-4">
        <div className="flex flex-wrap gap-2">
          <AttentionReasonBadge student={student} />

          {student.assigned_count === 0 ? (
            <Badge label="No club" tone="red" />
          ) : null}

          {student.got_high_interest_club ? (
            <Badge label="Got high-interest club" tone="green" />
          ) : student.attention_reason === 'No high-interest club assigned' ? (
            <Badge label="No high-interest match" tone="orange" />
          ) : null}

          {student.got_top_choice ? (
            <Badge label="Got #1 choice" tone="green" />
          ) : null}

          {student.is_addressed ? (
            <Badge label="Reviewed" tone="green" />
          ) : (
            <Badge label="Still needs help" tone="yellow" />
          )}
        </div>

        {student.attention_detail ? (
          <div className="mt-3 rounded-xl border bg-white p-3 text-sm text-slate-700">
            {student.attention_detail}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <DetailItem label="Student" value={student.student_name ?? 'Unknown student'} />
          <DetailItem label="Email" value={student.student_email ?? '—'} />
          <DetailItem label="Grade" value={student.grade ?? '—'} />
          <DetailItem
            label="Homeroom"
            value={student.teacher_homeroom_text ?? '—'}
          />
          <DetailItem label="Clubs wanted" value={student.requested} />
          <DetailItem label="Currently assigned" value={student.assigned_count} />
          <DetailItem label="Still wanted" value={student.unmet} />
          <DetailItem
            label="High-interest clubs"
            value={`${student.high_interest_assigned_count ?? 0} of ${
              student.high_interest_requested_count ?? 0
            } received`}
          />
          <DetailItem
            label="#1 choice"
            value={student.got_top_choice ? 'Received' : 'Not received'}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Current clubs</h3>

        {currentClubs.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            This student is not currently assigned to any clubs.
          </div>
        ) : (
          <div className="space-y-2">
            {currentClubs.map((club) => (
              <div
                key={club.club_offering_id}
                className="rounded-xl border bg-white p-3 text-sm"
              >
                <div className="font-medium text-slate-900">
                  {displayClubName(club)}
                </div>
                <div className="mt-1 text-slate-500">
                  {club.meeting_days.length > 0
                    ? club.meeting_days.join(', ')
                    : 'No day set'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Clubs this student liked</h3>

        {interestedClubs.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            This student did not choose any clubs they were interested in.
          </div>
        ) : (
          <div className="space-y-2">
            {interestedClubs.map((club) => (
              <InterestedClubCard
                key={club.club_offering_id}
                student={student}
                club={club}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>

      <MarkAddressedForm student={student} onClose={onClose} />
    </div>
  );
}

function InterestedClubCard({
  student,
  club,
  onClose,
}: {
  student: NeedsAttentionStudentRow;
  club: InterestedClubRow;
  onClose: () => void;
}) {
  async function handleAddAction(formData: FormData) {
    await addDraftAssignment(formData);
    onClose();
  }

  return (
    <div className="rounded-xl border bg-white p-3 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="font-medium text-slate-900">{displayClubName(club)}</div>
          <div className="mt-1 text-slate-500">
            {club.meeting_days.length > 0
              ? club.meeting_days.join(', ')
              : 'No day set'}
            {club.sponsor_name ? ` · ${club.sponsor_name}` : ''}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {club.is_top_choice ? <Badge label="Top choice" tone="green" /> : null}

          <Badge
            label={interestLabel(club.interest_score)}
            tone={club.interest_score >= 2 ? 'blue' : 'slate'}
          />

          {club.is_already_assigned ? (
            <Badge label="Already assigned" tone="green" />
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
        <MiniStat
          label="Enrollment"
          value={`${club.assigned_count}/${
            club.capacity_type === 'unlimited' ? '∞' : club.max_capacity ?? '—'
          }`}
        />
        <MiniStat label="Minimum" value={club.minimum_viable_enrollment ?? 0} />
        <MiniStat label="Interest" value={interestLabel(club.interest_score)} />
      </div>

      {!club.is_already_assigned ? (
        <details className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-blue-950">
            Add to this club
          </summary>

          <form action={handleAddAction} onSubmit={handleAddSubmit} className="mt-3 space-y-3">
            <input type="hidden" name="student_id" value={student.student_id} />
            <input
              type="hidden"
              name="club_offering_id"
              value={club.club_offering_id}
            />

            <AddWarnings student={student} club={club} />

            <div>
              <label className="mb-1 block text-sm font-medium text-blue-950">
                Optional note
              </label>
              <Input
                name="reason"
                placeholder="Example: coordinator reviewed and added student"
              />
            </div>

            <Button type="submit">Add to club</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function AddWarnings({
  student,
  club,
}: {
  student: NeedsAttentionStudentRow;
  club: InterestedClubRow;
}) {
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

  if (student.unmet <= 0) {
    warnings.push(
      'This student already has the number of clubs they asked for. Adding another club may give them more than requested.'
    );
  }

  if (
    student.attention_reason === 'No high-interest club assigned' &&
    club.interest_score < 2
  ) {
    warnings.push(
      'This student is listed because they did not receive a high-interest club. This club was not marked high interest.'
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

function MarkAddressedForm({
  student,
  onClose,
}: {
  student: NeedsAttentionStudentRow;
  onClose: () => void;
}) {
  async function handleAddressedAction(formData: FormData) {
    await markStudentNeedsAttentionAddressed(formData);
    onClose();
  }

  return (
    <details className="rounded-xl border border-green-200 bg-green-50 p-4">
      <summary className="cursor-pointer font-semibold text-green-950">
        Mark reviewed without changes
      </summary>

      <form
        action={handleAddressedAction}
        onSubmit={handleAddressedSubmit}
        className="mt-3 space-y-3"
      >
        <input type="hidden" name="student_id" value={student.student_id} />

        <div>
          <label className="mb-1 block text-sm font-medium text-green-950">
            Optional note
          </label>
          <Input
            name="reason"
            placeholder="Example: reviewed by coordinator, no roster change needed"
          />
        </div>

        <p className="text-xs text-green-900">
          Use this when you reviewed the student and do not need to make a roster
          change.
        </p>

        <Button type="submit" variant="outline">
          Mark reviewed
        </Button>
      </form>
    </details>
  );
}

function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
  const form = event.currentTarget;
  const formData = new FormData(form);
  const studentId = String(formData.get('student_id') ?? '').trim();

  if (!studentId) {
    event.preventDefault();
    window.alert('Missing student.');
    return;
  }

  const confirmed = window.confirm(
    'Add this student to this draft club roster? This change will be saved in the roster history.'
  );

  if (!confirmed) {
    event.preventDefault();
  }
}

function handleAddressedSubmit(event: FormEvent<HTMLFormElement>) {
  const confirmed = window.confirm(
    'Mark this student as reviewed without making a roster change?'
  );

  if (!confirmed) {
    event.preventDefault();
  }
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

function AttentionReasonBadge({
  student,
}: {
  student: NeedsAttentionStudentRow;
}) {
  if (student.attention_reason === 'No club assigned') {
    return <Badge label="No club assigned" tone="red" />;
  }

  if (student.attention_reason === 'No high-interest club assigned') {
    return <Badge label="No high-interest match" tone="orange" />;
  }

  return <Badge label="Needs help" tone="yellow" />;
}

function Badge({ label, tone }: { label: string; tone: Tone }) {
  const className = toneClass(tone);

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

function toneClass(tone: Tone) {
  if (tone === 'green') return 'border-green-200 bg-green-50 text-green-900';
  if (tone === 'yellow') return 'border-yellow-200 bg-yellow-50 text-yellow-900';
  if (tone === 'red') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'orange') return 'border-orange-200 bg-orange-50 text-orange-900';
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-900';
  if (tone === 'purple') return 'border-purple-200 bg-purple-50 text-purple-900';

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function displayClubName(club: {
  club_title: string | null;
  section_label: string | null;
}) {
  return (
    [club.club_title, club.section_label].filter(Boolean).join(' — ') ||
    'Unknown club'
  );
}

function reasonPriority(student: NeedsAttentionStudentRow) {
  if (student.attention_reason === 'No club assigned') return 2;
  if (student.attention_reason === 'No high-interest club assigned') return 1;

  return 0;
}

function interestLabel(score: number) {
  if (score >= 2) return 'Really wants this';
  if (score === 1) return 'Would try this';

  return 'Not interested';
}