"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { saveClubAdmin, deleteClubAdmin } from "./mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ClubStatusButton from "./club-status-button";
import SpanishTranslationFields from "./spanish-translation-fields";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const GRADES = [3, 4, 5];

type ClubRow = {
  id: string;
  club_title: string;
  section_label: string | null;
  description: string | null;
  club_title_es: string | null;
  section_label_es: string | null;
  description_es: string | null;
  spanish_translation_ready: boolean | null;
  sponsor_name: string | null;
  leader_email: string | null;
  meeting_days: string[] | null;
  capacity_type: string | null;
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  minimum_applies_to: string | null;
  grade_limited: boolean | null;
  eligible_grades: number[] | null;
  eligible_grade: number | null;
  matching_preference: string | null;
  admin_notes: string | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
  issue_count?: number;
  issue_severities?: string[];
};

type SortKey =
  | "club_title"
  | "sponsor_name"
  | "meeting_days"
  | "capacity"
  | "minimum"
  | "is_active"
  | "show_to_students"
  | "issue_count";

type SortDirection = "asc" | "desc";
type DayFilter = "all" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";
type VisibilityFilter = "all" | "ready" | "attention";
type GradeFilter = "all" | "limited" | "unlimited" | "3" | "4" | "5";

const blankClub: ClubRow = {
  id: "",
  club_title: "",
  section_label: null,
  description: "",
  club_title_es: "",
  section_label_es: "",
  description_es: "",
  spanish_translation_ready: false,
  sponsor_name: "",
  leader_email: "",
  meeting_days: [],
  capacity_type: "limited",
  max_capacity: null,
  minimum_viable_enrollment: null,
  minimum_applies_to: "section",
  grade_limited: false,
  eligible_grades: null,
  eligible_grade: null,
  matching_preference: "highest_interest",
  admin_notes: "",
  is_active: true,
  show_to_students: true,
  issue_count: 0,
  issue_severities: [],
};

export function ClubsTableClient({
  clubs,
  studentFormExists = false,
}: {
  clubs: ClubRow[];
  studentFormExists?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("club_title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedClub, setSelectedClub] = useState<ClubRow | null>(null);
  const [isAddingClub, setIsAddingClub] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredClubs = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = clubs.filter((club) => {
      const meetingDays = Array.isArray(club.meeting_days) ? club.meeting_days : [];
      const eligibleGrades = getEligibleGrades(club);

      const haystack = [
        club.club_title,
        club.section_label,
        club.sponsor_name,
        club.leader_email,
        club.description,
        meetingDays.join(" "),
        eligibleGrades.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (dayFilter !== "all" && !meetingDays.includes(dayFilter)) return false;
      const readyForStudents = isReadyForStudents(club);
      if (visibilityFilter === "ready" && !readyForStudents) return false;
      if (visibilityFilter === "attention" && readyForStudents) return false;
      if (gradeFilter === "limited" && !club.grade_limited) return false;
      if (gradeFilter === "unlimited" && club.grade_limited) return false;

      if (["3", "4", "5"].includes(gradeFilter) && !eligibleGrades.includes(Number(gradeFilter))) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let result = 0;

      if (sortKey === "club_title") {
        result = displayClubTitle(a).localeCompare(displayClubTitle(b));
      } else if (sortKey === "sponsor_name") {
        result = String(a.sponsor_name ?? "").localeCompare(String(b.sponsor_name ?? ""));
      } else if (sortKey === "meeting_days") {
        result = displayMeetingDays(a).localeCompare(displayMeetingDays(b));
      } else if (sortKey === "capacity") {
        result = capacitySortValue(a) - capacitySortValue(b);
      } else if (sortKey === "minimum") {
        result = Number(a.minimum_viable_enrollment ?? 0) - Number(b.minimum_viable_enrollment ?? 0);
      } else if (sortKey === "is_active") {
        result = (a.is_active === false ? 0 : 1) - (b.is_active === false ? 0 : 1);
      } else if (sortKey === "show_to_students") {
        result = (a.show_to_students === false ? 0 : 1) - (b.show_to_students === false ? 0 : 1);
      } else {
        result = Number(a.issue_count ?? 0) - Number(b.issue_count ?? 0);
      }

      return sortDirection === "asc" ? result : -result;
    });

    return filtered;
  }, [
    clubs,
    search,
    dayFilter,
    visibilityFilter,
    gradeFilter,
    sortKey,
    sortDirection,
  ]);

  const readyCount = clubs.filter(isReadyForStudents).length;
  const attentionCount = clubs.length - readyCount;

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  function sortLabel(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDirection === "asc" ? " up" : " down";
  }

  function confirmDiscardIfNeeded() {
    if (!hasUnsavedChanges) return true;
    return window.confirm("You have unsaved changes. Discard those changes and close?");
  }

  function closeDrawer() {
    if (!confirmDiscardIfNeeded()) return;
    setSelectedClub(null);
    setIsAddingClub(false);
    setHasUnsavedChanges(false);
  }

  function openAddDrawer() {
    if (studentFormExists) {
      window.alert(
        "The student form has already been created for this session. New clubs cannot be added after the form is created."
      );
      return;
    }

    if (!confirmDiscardIfNeeded()) return;
    setSelectedClub(null);
    setIsAddingClub(true);
    setHasUnsavedChanges(false);
  }

  function openEditDrawer(club: ClubRow) {
    if (!confirmDiscardIfNeeded()) return;
    setIsAddingClub(false);
    setSelectedClub(club);
    setHasUnsavedChanges(false);
  }

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    if (studentFormExists) {
      event.preventDefault();
      window.alert(
        "The student form has already been created for this session. Clubs cannot be deleted after the form is created."
      );
      return;
    }

    const confirmed = window.confirm("Delete this club? This cannot be undone.");
    if (!confirmed) event.preventDefault();
  }

  async function handleSaveAction(formData: FormData) {
    setIsSaving(true);
    setHasUnsavedChanges(false);

    try {
      await saveClubAdmin(formData);
      setSelectedClub(null);
      setIsAddingClub(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save club.";
      window.alert(message);
      setHasUnsavedChanges(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteAction(formData: FormData) {
    setIsDeleting(true);

    try {
      await deleteClubAdmin(formData);
      setSelectedClub(null);
      setIsAddingClub(false);
      setHasUnsavedChanges(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete club.";
      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  }

  const drawerClub = isAddingClub ? blankClub : selectedClub;
  const drawerTitle = isAddingClub ? "Add club" : "Edit club";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">Clubs</h2>
            <p className="mt-1 text-sm text-slate-600">Click a club to review or edit it.</p>

            {studentFormExists ? (
              <p className="mt-2 text-sm text-amber-700">
                The student form has already been created, so new clubs cannot be added for this session.
              </p>
            ) : null}
          </div>

          <Button type="button" onClick={openAddDrawer} disabled={studentFormExists}>
            Add club
          </Button>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryStat label="Ready for students" value={readyCount} />
          <SummaryStat label="Inactive or needs attention" value={attentionCount} />
        </div>
      </div>
      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search club, leader, email, or description"
          />

          <select value={dayFilter} onChange={(event) => setDayFilter(event.target.value as DayFilter)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All days</option>
            {DAYS.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>

          <select
            value={visibilityFilter}
            onChange={(event) =>
              setVisibilityFilter(
                event.target.value as VisibilityFilter
              )
            }
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All clubs</option>
            <option value="ready">Ready for students</option>
            <option value="attention">Inactive or needs attention</option>
          </select>

          <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value as GradeFilter)} className="rounded-xl border px-3 py-2 text-sm">
            <option value="all">All grades</option>
            <option value="limited">Specific grades</option>
            <option value="unlimited">All grades allowed</option>
            <option value="3">Grade 3</option>
            <option value="4">Grade 4</option>
            <option value="5">Grade 5</option>
          </select>
        </div>

        <div className="border-b px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-900">{filteredClubs.length}</span> of <span className="font-medium text-slate-900">{clubs.length}</span> clubs
        </div>

        {filteredClubs.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">No clubs match your current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <HeaderButton label={`Club${sortLabel("club_title")}`} onClick={() => toggleSort("club_title")} />
                  <HeaderButton label={`Leader${sortLabel("sponsor_name")}`} onClick={() => toggleSort("sponsor_name")} />
                  <HeaderButton label={`Days${sortLabel("meeting_days")}`} onClick={() => toggleSort("meeting_days")} />
                  <HeaderButton label={`Spots${sortLabel("capacity")}`} onClick={() => toggleSort("capacity")} />
                  <HeaderButton label={`Minimum${sortLabel("minimum")}`} onClick={() => toggleSort("minimum")} />
                  <HeaderButton label={`Club status${sortLabel("issue_count")}`} onClick={() => toggleSort("issue_count")} />
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredClubs.map((club) => (
                  <tr key={club.id} onClick={() => openEditDrawer(club)} className="cursor-pointer hover:bg-blue-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{club.club_title}</div>
                      {club.section_label ? <div className="text-xs text-slate-500">{club.section_label}</div> : null}
                      <div className="mt-1 text-xs text-slate-500">{displayEligibleGrades(club)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{club.sponsor_name ?? "Not set"}</div>
                      {club.leader_email ? <div className="text-xs text-slate-500">{club.leader_email}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{displayMeetingDays(club)}</td>
                    <td className="px-4 py-3 text-slate-700">{displayCapacity(club)}</td>
                    <td className="px-4 py-3 text-slate-700">{club.minimum_viable_enrollment ?? 0}</td>
                    <td className="w-64 px-4 py-3 align-top">
                      <ClubStatusSummary club={club} studentFormExists={studentFormExists} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerClub ? (
        <Drawer title={drawerTitle} onClose={closeDrawer}>
          <ClubForm
            club={drawerClub}
            isAdding={isAddingClub}
            studentFormExists={studentFormExists}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={isSaving}
            isDeleting={isDeleting}
            onChange={() => setHasUnsavedChanges(true)}
            onSave={handleSaveAction}
            onDelete={handleDeleteAction}
            onDeleteSubmit={handleDeleteSubmit}
            onCancel={closeDrawer}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

function ClubForm({
  club,
  isAdding,
  studentFormExists,
  hasUnsavedChanges,
  isSaving,
  isDeleting,
  onChange,
  onSave,
  onDelete,
  onDeleteSubmit,
  onCancel,
}: {
  club: ClubRow;
  isAdding: boolean;
  studentFormExists: boolean;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onChange: () => void;
  onSave: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
  onDeleteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const meetingDays = Array.isArray(club.meeting_days) ? club.meeting_days : [];
  const eligibleGrades = getEligibleGrades(club);

  return (
    <div className="space-y-6">
      {studentFormExists ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The student form has already been created. Small edits to this club are okay, but avoid changing the club name, section, or grade availability unless students have not started responding.
        </div>
      ) : null}

      <form action={onSave} onChange={onChange} className="space-y-4" data-club-editor="true">
        {club.id ? <input type="hidden" name="id" value={club.id} /> : null}

        <div>
          <label className="mb-1 block text-sm font-medium">Club name</label>
          <Input name="club_title" defaultValue={club.club_title} placeholder="Club name" required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <Input name="section_label" defaultValue={club.section_label ?? ""} placeholder='Optional, e.g. "Mondays" or "Grade 3"' />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <Textarea name="description" defaultValue={club.description ?? ""} placeholder="Describe what students will do in this club" />
        </div>

        {!isAdding && !club.spanish_translation_ready && Boolean(club.club_title_es || club.description_es) ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <strong>Please review the Spanish text</strong>
            <p className="mt-1">The English club information may have changed. Check the Spanish below, then mark it ready again.</p>
          </div>
        ) : null}
        <SpanishTranslationFields
          spanishTitle={club.club_title_es ?? ""}
          spanishSection={club.section_label_es ?? ""}
          spanishDescription={club.description_es ?? ""}
          ready={Boolean(club.spanish_translation_ready)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Leader</label>
            <Input name="sponsor_name" defaultValue={club.sponsor_name ?? ""} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Leader email</label>
            <Input name="leader_email" type="email" defaultValue={club.leader_email ?? ""} placeholder="Optional but recommended" />
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">Meeting days</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {DAYS.map((day) => (
              <label key={day} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                <input type="checkbox" name="meeting_days" value={day} defaultChecked={meetingDays.includes(day)} />
                {day}
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Spots</label>
            <select name="capacity_type" defaultValue={club.capacity_type ?? "limited"} className="w-full rounded-xl border px-3 py-2">
              <option value="limited">Limited</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Maximum students</label>
            <Input name="max_capacity" type="number" min="0" defaultValue={club.max_capacity ?? ""} placeholder="Required if limited" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Minimum students</label>
            <Input name="minimum_viable_enrollment" type="number" min="0" defaultValue={club.minimum_viable_enrollment ?? ""} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Minimum applies to</label>
            <select name="minimum_applies_to" defaultValue={club.minimum_applies_to ?? "section"} className="w-full rounded-xl border px-3 py-2">
              <option value="section">This section</option>
              <option value="title">All sections with this club name</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 rounded-xl border bg-slate-50 p-3 text-sm">
          <input type="checkbox" name="grade_limited" defaultChecked={Boolean(club.grade_limited)} />
          Limit this club to specific grades
        </label>

        <div>
          <div className="mb-2 text-sm font-medium">Grades that can choose this club</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {GRADES.map((grade) => (
              <label key={grade} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                <input type="checkbox" name="eligible_grades" value={grade} defaultChecked={eligibleGrades.includes(grade)} />
                Grade {grade}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">How to fill this club</label>
          <select name="matching_preference" defaultValue={club.matching_preference ?? "highest_interest"} className="w-full rounded-xl border px-3 py-2">
            <option value="highest_interest">Prioritize strongest interest</option>
            <option value="grade_balance">Try for a grade mix</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Coordinator notes</label>
          <Textarea name="admin_notes" defaultValue={club.admin_notes ?? ""} placeholder="Internal notes" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border bg-slate-50 p-3 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={club.is_active !== false} />
            Club is active in this session
          </label>
          <label className="flex items-center gap-2 rounded-xl border bg-slate-50 p-3 text-sm">
            <input type="checkbox" name="show_to_students" defaultChecked={club.show_to_students !== false} />
            Available to students
          </label>
        </div>

        {hasUnsavedChanges ? (
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
            You have unsaved changes.
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={isSaving}>{isSaving ? "Saving..." : isAdding ? "Add club" : "Save changes"}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        </div>
      </form>

      {!isAdding ? (
        <div className="border-t pt-4">
          <div className="mb-2 text-sm font-medium text-slate-900">Delete club</div>
          <p className="mb-3 text-sm text-slate-600">Delete this club only if it was entered by mistake.</p>
          {studentFormExists ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              This club cannot be deleted because the student form has already been created.
            </div>
          ) : null}
          <form action={onDelete} onSubmit={onDeleteSubmit}>
            <input type="hidden" name="id" value={club.id} />
            <Button type="submit" variant="destructive" disabled={isDeleting || studentFormExists}>{isDeleting ? "Deleting..." : "Delete club"}</Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function isReadyForStudents(club: ClubRow) {
  return club.is_active !== false && club.show_to_students !== false && Number(club.issue_count ?? 0) === 0;
}
function ClubStatusSummary({ club, studentFormExists }: { club: ClubRow; studentFormExists: boolean }) {
  if (club.is_active === false) return <div className="space-y-1.5"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Paused</span><p className="text-xs text-slate-500">Not offered this session.</p><ClubStatusButton clubId={club.id} action="reactivate" disabled={studentFormExists} /></div>;
  if (club.show_to_students === false) return <div className="space-y-1.5"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Hidden from students</span><p className="text-xs text-slate-500">Not shown on the student form.</p><ClubStatusButton clubId={club.id} action="make_available" disabled={studentFormExists} /></div>;
  if (Number(club.issue_count ?? 0) > 0) return <div className="space-y-1.5"><span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">Fix setup</span><p className="text-xs text-red-700">Open this club to review {club.issue_count} setup {club.issue_count === 1 ? "item" : "items"}.</p></div>;
  if (!club.spanish_translation_ready) return <div className="space-y-1.5"><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">Review Spanish</span><p className="text-xs text-amber-800">Check the Spanish text before creating the form.</p><ClubStatusButton clubId={club.id} action="hide" disabled={studentFormExists} /></div>;
  return <div className="space-y-1.5"><span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">Ready for students</span><p className="text-xs text-slate-500">Included on the student form.</p><ClubStatusButton clubId={club.id} action="hide" disabled={studentFormExists} /></div>;
}
function HeaderButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={onClick} className="font-medium hover:text-slate-900">{label}</button>
    </th>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <button type="button" aria-label="Close drawer" className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function getEligibleGrades(club: ClubRow) {
  if (Array.isArray(club.eligible_grades)) return club.eligible_grades;
  if (club.eligible_grade) return [club.eligible_grade];
  return [];
}

function displayClubTitle(club: ClubRow) {
  return [club.club_title, club.section_label].filter(Boolean).join(" - ");
}

function displayMeetingDays(club: ClubRow) {
  const days = Array.isArray(club.meeting_days) ? club.meeting_days : [];
  return days.length > 0 ? days.join(", ") : "Not set";
}

function displayCapacity(club: ClubRow) {
  if (club.capacity_type === "unlimited") return "Unlimited";
  return club.max_capacity ? `Up to ${club.max_capacity}` : "Limited";
}

function displayEligibleGrades(club: ClubRow) {
  if (!club.grade_limited) return "All grades";
  const grades = getEligibleGrades(club);
  return grades.length > 0 ? `Grades ${grades.join(", ")}` : "Specific grades not selected";
}

function capacitySortValue(club: ClubRow) {
  if (club.capacity_type === "unlimited") return 9999;
  return Number(club.max_capacity ?? 0);
}
