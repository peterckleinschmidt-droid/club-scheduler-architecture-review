"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RatingRow = {
  id?: string;
  club_offering_id: string;
  interest_level: string | null;
  interest_score: number | null;
  club_title?: string | null;
  section_label?: string | null;
};

type SubmissionRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  submitted_at: string | null;
  participation_preference: string | null;
  max_clubs: number | null;
  top_choice_club_id: string | null;
  top_choice_title: string | null;
  is_latest: boolean | null;
  ratings: RatingRow[];
};

type SortKey =
  | "student_name"
  | "grade"
  | "teacher_homeroom_text"
  | "submitted_at"
  | "max_clubs"
  | "rating_count"
  | "high_interest_count";

type SortDirection = "asc" | "desc";
type GradeFilter = "all" | "3" | "4" | "5";
type MaxClubsFilter = "all" | "0" | "1" | "2" | "3";

export function StudentSubmissionsTableClient({
  submissions,
}: {
  submissions: SubmissionRow[];
}) {
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [maxClubsFilter, setMaxClubsFilter] = useState<MaxClubsFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("submitted_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedSubmission, setSelectedSubmission] =
    useState<SubmissionRow | null>(null);

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = submissions.filter((submission) => {
      const haystack = [
        submission.student_name,
        submission.student_email,
        submission.teacher_homeroom_text,
        submission.top_choice_title,
        submission.ratings.map((rating) => rating.club_title).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (query && !haystack.includes(query)) return false;

      if (gradeFilter !== "all" && String(submission.grade) !== gradeFilter) {
        return false;
      }

      if (
        maxClubsFilter !== "all" &&
        String(submission.max_clubs ?? 0) !== maxClubsFilter
      ) {
        return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let result = 0;

      if (sortKey === "student_name") {
        result = String(a.student_name ?? "").localeCompare(
          String(b.student_name ?? "")
        );
      } else if (sortKey === "grade") {
        result = Number(a.grade ?? 0) - Number(b.grade ?? 0);
      } else if (sortKey === "teacher_homeroom_text") {
        result = String(a.teacher_homeroom_text ?? "").localeCompare(
          String(b.teacher_homeroom_text ?? "")
        );
      } else if (sortKey === "submitted_at") {
        result =
          new Date(a.submitted_at ?? 0).getTime() -
          new Date(b.submitted_at ?? 0).getTime();
      } else if (sortKey === "max_clubs") {
        result = Number(a.max_clubs ?? 0) - Number(b.max_clubs ?? 0);
      } else if (sortKey === "rating_count") {
        result = a.ratings.length - b.ratings.length;
      } else {
        result = highInterestCount(a) - highInterestCount(b);
      }

      return sortDirection === "asc" ? result : -result;
    });

    return filtered;
  }, [submissions, search, gradeFilter, maxClubsFilter, sortKey, sortDirection]);

  const requestingClubsCount = submissions.filter(
    (submission) => Number(submission.max_clubs ?? 0) > 0
  ).length;

  const noClubsCount = submissions.filter(
    (submission) => Number(submission.max_clubs ?? 0) === 0
  ).length;

  const averageChoices =
    submissions.length > 0
      ? Math.round(
          submissions.reduce(
            (sum, submission) => sum + positiveChoiceCount(submission),
            0
          ) / submissions.length
        )
      : 0;

  function toggleSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === "submitted_at" ? "desc" : "asc");
  }

  function sortLabel(key: SortKey) {
    if (key !== sortKey) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold">Student choice summary</h2>
            <p className="mt-1 text-sm text-slate-600">
              Click a student to see the clubs they chose.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <SummaryStat label="Students submitted" value={submissions.length} />
          <SummaryStat label="Want clubs" value={requestingClubsCount} />
          <SummaryStat label="No clubs wanted" value={noClubsCount} />
          <SummaryStat label="Avg choices/student" value={averageChoices} />
        </div>
      </div>

      <div className="rounded-2xl border bg-white">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
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
            value={maxClubsFilter}
            onChange={(event) =>
              setMaxClubsFilter(event.target.value as MaxClubsFilter)
            }
            className="rounded-xl border px-3 py-2 text-sm"
          >
            <option value="all">All students</option>
            <option value="0">No clubs wanted</option>
            <option value="1">Wants up to 1 club</option>
            <option value="2">Wants up to 2 clubs</option>
            <option value="3">Wants up to 3 clubs</option>
          </select>
        </div>

        <div className="border-b px-4 py-3 text-sm text-slate-600">
          Showing <span className="font-medium text-slate-900">{filteredSubmissions.length}</span> of{" "}
          <span className="font-medium text-slate-900">{submissions.length}</span> students
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No students match your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <HeaderButton
                    label={`Student${sortLabel("student_name")}`}
                    onClick={() => toggleSort("student_name")}
                  />
                  <HeaderButton
                    label={`Grade${sortLabel("grade")}`}
                    onClick={() => toggleSort("grade")}
                  />
                  <HeaderButton
                    label={`Homeroom${sortLabel("teacher_homeroom_text")}`}
                    onClick={() => toggleSort("teacher_homeroom_text")}
                  />
                  <HeaderButton
                    label={`Submitted${sortLabel("submitted_at")}`}
                    onClick={() => toggleSort("submitted_at")}
                  />
                  <HeaderButton
                    label={`Clubs wanted${sortLabel("max_clubs")}`}
                    onClick={() => toggleSort("max_clubs")}
                  />
                  <HeaderButton
                    label={`Choices${sortLabel("rating_count")}`}
                    onClick={() => toggleSort("rating_count")}
                  />
                  <HeaderButton
                    label={`Really wants${sortLabel("high_interest_count")}`}
                    onClick={() => toggleSort("high_interest_count")}
                  />
                  <th className="px-4 py-3 font-medium">Top choice</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredSubmissions.map((submission) => (
                  <tr
                    key={submission.id}
                    onClick={() => setSelectedSubmission(submission)}
                    className="cursor-pointer hover:bg-blue-50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {submission.student_name ?? "Unknown student"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {submission.student_email ?? "No email"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {submission.grade ?? "—"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {submission.teacher_homeroom_text ?? "—"}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {formatDateTime(submission.submitted_at)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {displayMaxClubs(submission.max_clubs)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {positiveChoiceCount(submission)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {highInterestCount(submission)}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {submission.top_choice_title ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedSubmission ? (
        <Drawer
          title={selectedSubmission.student_name ?? "Student choices"}
          onClose={() => setSelectedSubmission(null)}
        >
          <SubmissionDetail submission={selectedSubmission} />
        </Drawer>
      ) : null}
    </div>
  );
}

function SubmissionDetail({ submission }: { submission: SubmissionRow }) {
  const sortedRatings = [...submission.ratings].sort(
    (a, b) => Number(b.interest_score ?? 0) - Number(a.interest_score ?? 0)
  );

  const interestedRatings = sortedRatings.filter(
    (rating) => Number(rating.interest_score ?? 0) > 0
  );

  const notInterestedRatings = sortedRatings.filter(
    (rating) => Number(rating.interest_score ?? 0) <= 0
  );

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-slate-50 p-4">
        <div className="text-lg font-semibold">
          {submission.student_name ?? "Unknown student"}
        </div>
        <div className="mt-1 text-sm text-slate-600">
          {submission.student_email ?? "No email"}
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <DetailItem label="Grade" value={submission.grade ?? "—"} />
          <DetailItem
            label="Homeroom"
            value={submission.teacher_homeroom_text ?? "—"}
          />
          <DetailItem
            label="Submitted"
            value={formatDateTime(submission.submitted_at)}
          />
          <DetailItem
            label="Clubs wanted"
            value={displayMaxClubs(submission.max_clubs)}
          />
          <DetailItem
            label="Top choice"
            value={submission.top_choice_title ?? "—"}
          />
          <DetailItem label="Really wants" value={highInterestCount(submission)} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Club choices</h3>

        {interestedRatings.length === 0 ? (
          <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">
            This student did not choose any clubs they want.
          </div>
        ) : (
          <div className="space-y-2">
            {interestedRatings.map((rating) => (
              <div
                key={`${rating.club_offering_id}-${rating.interest_score}`}
                className="rounded-xl border bg-white p-3 text-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">
                      {rating.club_title ?? "Unknown club"}
                      {rating.section_label ? (
                        <span className="font-normal text-slate-500">
                          {" "}— {rating.section_label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <InterestBadge score={Number(rating.interest_score ?? 0)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {notInterestedRatings.length > 0 ? (
          <details className="mt-3 rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Show clubs marked not interested
            </summary>

            <div className="mt-3 space-y-2">
              {notInterestedRatings.map((rating) => (
                <div
                  key={`${rating.club_offering_id}-${rating.interest_score}-not-interested`}
                  className="rounded-xl border bg-white p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="font-medium">
                      {rating.club_title ?? "Unknown club"}
                      {rating.section_label ? (
                        <span className="font-normal text-slate-500">
                          {" "}— {rating.section_label}
                        </span>
                      ) : null}
                    </div>

                    <InterestBadge score={Number(rating.interest_score ?? 0)} />
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function InterestBadge({ score }: { score: number }) {
  if (score >= 2) {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
        Really wants this
      </span>
    );
  }

  if (score === 1) {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
        Would try this
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
      Not interested
    </span>
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

      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
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

function highInterestCount(submission: SubmissionRow) {
  return submission.ratings.filter(
    (rating) => Number(rating.interest_score ?? 0) >= 2
  ).length;
}

function positiveChoiceCount(submission: SubmissionRow) {
  return submission.ratings.filter(
    (rating) => Number(rating.interest_score ?? 0) > 0
  ).length;
}

function displayMaxClubs(maxClubs: number | null) {
  if (!maxClubs) return "No clubs";
  if (maxClubs === 1) return "Up to 1 club";
  return `Up to ${maxClubs} clubs`;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
