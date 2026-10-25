import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { hardDeleteSchoolYear } from './actions';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusBadge({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'slate';
}) {
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
              : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'green' | 'yellow' | 'red' | 'orange' | 'blue' | 'slate';
}) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50'
      : tone === 'yellow'
        ? 'border-yellow-200 bg-yellow-50'
        : tone === 'red'
          ? 'border-red-200 bg-red-50'
          : tone === 'orange'
            ? 'border-orange-200 bg-orange-50'
            : tone === 'blue'
              ? 'border-blue-200 bg-blue-50'
              : 'border-slate-200 bg-white';

  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
}

function DeletePlanRow({
  order,
  label,
  count,
  description,
}: {
  order: number;
  label: string;
  count: number;
  description: string;
}) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
        {order}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">
        {label}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-900">
        {count}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600">{description}</td>
    </tr>
  );
}

export default async function SchoolYearDangerZonePage({
  params,
}: {
  params: Promise<{ schoolYearId: string }>;
}) {
  const { schoolYearId } = await params;

  const supabase = await createClient();
  const { year: activeYear } = await getActiveContext();

  const { data: schoolYear } = await supabase
    .from('school_years')
    .select('*')
    .eq('id', schoolYearId)
    .maybeSingle();

  if (!schoolYear) {
    notFound();
  }

  const [
    { data: blocksData = [] },
    { data: studentsData = [] },
    { data: clubOfferingsData = [] },
    { data: studentSubmissionsData = [] },
    { data: studentInterestRatingsData = [] },
    { data: matchRunsData = [] },
    { data: matchDemandSummariesData = [] },
    { data: draftAssignmentsData = [] },
    { data: finalAssignmentsData = [] },
    { data: assignmentOverridesData = [] },
    { data: belowMinimumDecisionsData = [] },
    { data: historySnapshotsData = [] },
    { data: historyStudentOutcomesData = [] },
  ] = await Promise.all([
    supabase
      .from('blocks')
      .select('id, school_year_id, label, status, finalized_at')
      .eq('school_year_id', schoolYearId),
    supabase
      .from('students')
      .select('id, school_year_id')
      .eq('school_year_id', schoolYearId),
    supabase.from('club_offerings').select('id, block_id'),
    supabase.from('student_submissions').select('id, block_id, student_id'),
    supabase
      .from('student_interest_ratings')
      .select('id, student_submission_id, club_offering_id'),
    supabase.from('match_runs').select('id, block_id'),
    supabase
      .from('match_demand_summaries')
      .select('id, match_run_id, club_offering_id'),
    supabase
      .from('draft_assignments')
      .select('id, match_run_id, student_id, club_offering_id'),
    supabase
      .from('final_assignments')
      .select('id, block_id, student_id, club_offering_id'),
    supabase
      .from('assignment_overrides')
      .select('id, block_id, match_run_id, student_id, club_offering_id'),
    supabase
      .from('below_minimum_decisions')
      .select('id, block_id, club_offering_id'),
    supabase
      .from('history_snapshots')
      .select('id, school_year_id, block_id')
      .eq('school_year_id', schoolYearId),
    supabase
      .from('history_student_outcomes')
      .select('id, history_snapshot_id, student_id'),
  ]);

  const blocks = (blocksData ?? []) as any[];
  const students = (studentsData ?? []) as any[];
  const clubOfferings = (clubOfferingsData ?? []) as any[];
  const studentSubmissions = (studentSubmissionsData ?? []) as any[];
  const studentInterestRatings = (studentInterestRatingsData ?? []) as any[];
  const matchRuns = (matchRunsData ?? []) as any[];
  const matchDemandSummaries = (matchDemandSummariesData ?? []) as any[];
  const draftAssignments = (draftAssignmentsData ?? []) as any[];
  const finalAssignments = (finalAssignmentsData ?? []) as any[];
  const assignmentOverrides = (assignmentOverridesData ?? []) as any[];
  const belowMinimumDecisions = (belowMinimumDecisionsData ?? []) as any[];
  const historySnapshots = (historySnapshotsData ?? []) as any[];
  const historyStudentOutcomes = (historyStudentOutcomesData ?? []) as any[];

  const blockIds = new Set(blocks.map((block) => block.id));
  const studentIds = new Set(students.map((student) => student.id));

  const clubOfferingIds = new Set(
    clubOfferings
      .filter((club) => blockIds.has(club.block_id))
      .map((club) => club.id)
  );

  const submissionIds = new Set(
    studentSubmissions
      .filter((submission) => blockIds.has(submission.block_id))
      .map((submission) => submission.id)
  );

  const matchRunIds = new Set(
    matchRuns.filter((run) => blockIds.has(run.block_id)).map((run) => run.id)
  );

  const snapshotIds = new Set(historySnapshots.map((snapshot) => snapshot.id));

  const clubsForYear = clubOfferings.filter((club) => blockIds.has(club.block_id));

  const submissionsForYear = studentSubmissions.filter((submission) =>
    blockIds.has(submission.block_id)
  );

  const interestRatingsForYear = studentInterestRatings.filter(
    (rating) =>
      submissionIds.has(rating.student_submission_id) ||
      clubOfferingIds.has(rating.club_offering_id)
  );

  const matchRunsForYear = matchRuns.filter((run) => blockIds.has(run.block_id));

  const demandSummariesForYear = matchDemandSummaries.filter(
    (summary) =>
      matchRunIds.has(summary.match_run_id) ||
      clubOfferingIds.has(summary.club_offering_id)
  );

  const draftAssignmentsForYear = draftAssignments.filter(
    (assignment) =>
      matchRunIds.has(assignment.match_run_id) ||
      studentIds.has(assignment.student_id) ||
      clubOfferingIds.has(assignment.club_offering_id)
  );

  const finalAssignmentsForYear = finalAssignments.filter(
    (assignment) =>
      blockIds.has(assignment.block_id) ||
      studentIds.has(assignment.student_id) ||
      clubOfferingIds.has(assignment.club_offering_id)
  );

  const overridesForYear = assignmentOverrides.filter(
    (override) =>
      blockIds.has(override.block_id) ||
      matchRunIds.has(override.match_run_id) ||
      studentIds.has(override.student_id) ||
      clubOfferingIds.has(override.club_offering_id)
  );

  const belowMinimumDecisionsForYear = belowMinimumDecisions.filter(
    (decision) =>
      blockIds.has(decision.block_id) ||
      clubOfferingIds.has(decision.club_offering_id)
  );

  const historyOutcomesForYear = historyStudentOutcomes.filter(
    (outcome) =>
      snapshotIds.has(outcome.history_snapshot_id) ||
      studentIds.has(outcome.student_id)
  );

  const finalizedBlocks = blocks.filter(
    (block) => block.status === 'finalized' || Boolean(block.finalized_at)
  );

  const isActiveYear = activeYear?.id === schoolYear.id;
  const canDelete = !isActiveYear && !schoolYear.is_active;

  const totalRelatedRows =
    blocks.length +
    students.length +
    clubsForYear.length +
    submissionsForYear.length +
    interestRatingsForYear.length +
    matchRunsForYear.length +
    demandSummariesForYear.length +
    draftAssignmentsForYear.length +
    finalAssignmentsForYear.length +
    overridesForYear.length +
    belowMinimumDecisionsForYear.length +
    historySnapshots.length +
    historyOutcomesForYear.length;

  const deletePlan = [
    {
      label: 'Saved student results',
      tableName: 'history_student_outcomes',
      count: historyOutcomesForYear.length,
      description: 'Student-level saved results from finalized sessions.',
    },
    {
      label: 'Saved session results',
      tableName: 'history_snapshots',
      count: historySnapshots.length,
      description: 'Saved result records created when sessions were finalized.',
    },
    {
      label: 'Roster changes',
      tableName: 'assignment_overrides',
      count: overridesForYear.length,
      description: 'Coordinator adds, removes, moves, and reviewed notes.',
    },
    {
      label: 'Final rosters',
      tableName: 'final_assignments',
      count: finalAssignmentsForYear.length,
      description: 'Final student-club roster spots.',
    },
    {
      label: 'Draft rosters',
      tableName: 'draft_assignments',
      count: draftAssignmentsForYear.length,
      description: 'Draft roster spots created by matching.',
    },
    {
      label: 'Club interest summaries',
      tableName: 'match_demand_summaries',
      count: demandSummariesForYear.length,
      description: 'Saved club interest and small-club summary rows.',
    },
    {
      label: 'Matching runs',
      tableName: 'match_runs',
      count: matchRunsForYear.length,
      description: 'Records of matching runs for this school year.',
    },
    {
      label: 'Small-club decisions',
      tableName: 'below_minimum_decisions',
      count: belowMinimumDecisionsForYear.length,
      description: 'Coordinator decisions to cancel or run small clubs.',
    },
    {
      label: 'Student club ratings',
      tableName: 'student_interest_ratings',
      count: interestRatingsForYear.length,
      description: 'Detailed club ratings attached to student choices.',
    },
    {
      label: 'Student choices',
      tableName: 'student_submissions',
      count: submissionsForYear.length,
      description: 'Student club choice forms for this school year.',
    },
    {
      label: 'Clubs',
      tableName: 'club_offerings',
      count: clubsForYear.length,
      description: 'Club records attached to this school year’s sessions.',
    },
    {
      label: 'Students',
      tableName: 'students',
      count: students.length,
      description: 'Student roster rows attached to this school year.',
    },
    {
      label: 'Club sessions',
      tableName: 'blocks',
      count: blocks.length,
      description: 'Club sessions attached to this school year.',
    },
    {
      label: 'School year',
      tableName: 'school_years',
      count: 1,
      description: 'The school year itself. This is deleted last.',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Link
            href={`/admin/archive/${schoolYear.id}`}
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            ← Back to {schoolYear.label ?? 'school year'}
          </Link>

          <span className="text-sm text-slate-400">/</span>

          <Link
            href="/admin/archive"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            Back to Past Years
          </Link>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Delete Options</h1>
            <p className="mt-1 text-sm text-slate-600">
              Review what would be permanently deleted for{' '}
              <span className="font-semibold">
                {schoolYear.label ?? 'this school year'}
              </span>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canDelete ? (
              <StatusBadge label="Delete available" tone="orange" />
            ) : (
              <StatusBadge label="Delete blocked" tone="red" />
            )}

            {isActiveYear || schoolYear.is_active ? (
              <StatusBadge label="Current year" tone="red" />
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={
          canDelete
            ? 'rounded-2xl border border-orange-200 bg-orange-50 p-4 text-orange-950'
            : 'rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900'
        }
      >
        <div className="font-semibold">
          {canDelete ? 'Deletion can be confirmed below' : 'Deletion is blocked'}
        </div>
        <p className="mt-1 text-sm">
          {canDelete
            ? 'This is not the current school year. Review the counts carefully before confirming deletion.'
            : 'This is the current school year or is marked active. Choose a different current year before deletion is available.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>School year</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                School year
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {schoolYear.label ?? 'Untitled school year'}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Created
              </div>
              <div className="mt-1 font-medium text-slate-900">
                {formatDateTime(schoolYear.created_at)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Sessions" value={blocks.length} />
        <Metric
          label="Finalized sessions"
          value={finalizedBlocks.length}
          tone={finalizedBlocks.length > 0 ? 'green' : 'slate'}
        />
        <Metric label="Students" value={students.length} />
        <Metric label="Clubs" value={clubsForYear.length} />
        <Metric
          label="Final roster spots"
          value={finalAssignmentsForYear.length}
          tone={finalAssignmentsForYear.length > 0 ? 'green' : 'slate'}
        />
        <Metric
          label="Rows to delete"
          value={totalRelatedRows + 1}
          detail="Includes school year row"
          tone={totalRelatedRows > 0 ? 'orange' : 'slate'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deletion preview</CardTitle>
        </CardHeader>

        <CardContent>
          <p className="mb-4 text-sm text-slate-600">
            These are the saved records that would be permanently deleted.
          </p>

          <div className="overflow-x-auto rounded-2xl border bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">What this removes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deletePlan.map((item, index) => (
                  <DeletePlanRow
                    key={item.tableName}
                    order={index + 1}
                    label={item.label}
                    count={item.count}
                    description={item.description}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <details className="mt-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Show database table names
            </summary>
            <div className="mt-2 grid gap-1 rounded-xl border bg-slate-50 p-3 font-mono text-xs">
              {deletePlan.map((item) => (
                <div key={`${item.tableName}-name`}>{item.tableName}</div>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-950">
            Permanently delete this school year
          </CardTitle>
        </CardHeader>

        <CardContent>
          {canDelete ? (
            <div className="space-y-4 text-sm text-red-950">
              <div className="rounded-xl border border-red-300 bg-white p-4">
                <div className="font-semibold">This cannot be undone</div>
                <p className="mt-1">
                  This will permanently delete this school year and all related data shown above.
                </p>
              </div>

              <form action={hardDeleteSchoolYear} className="space-y-4">
                <input type="hidden" name="school_year_id" value={schoolYear.id} />

                <div>
                  <label className="mb-1 block font-medium text-red-950">
                    Type the school year exactly to confirm
                  </label>

                  <input
                    name="school_year_label_confirmation"
                    className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm text-slate-900"
                    placeholder={schoolYear.label ?? 'School year label'}
                    required
                  />

                  <p className="mt-1 text-xs text-red-900">
                    Required text:{' '}
                    <span className="font-semibold">
                      {schoolYear.label ?? 'Untitled school year'}
                    </span>
                  </p>
                </div>

                <label className="flex gap-3 rounded-xl border border-red-300 bg-white p-3 text-sm">
                  <input
                    type="checkbox"
                    name="hard_delete_acknowledgement"
                    value="yes"
                    required
                    className="mt-1"
                  />

                  <span>
                    I understand this permanently deletes this school year and all related club scheduling data.
                  </span>
                </label>

                <button
                  type="submit"
                  className="rounded-xl border border-red-700 bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
                >
                  Permanently delete school year
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3 text-sm text-red-950">
              <div className="rounded-xl border border-red-300 bg-white p-4">
                <div className="font-semibold">Deletion is blocked</div>
                <p className="mt-1">
                  This is the current school year or is marked active. Choose a different current year before deleting this one.
                </p>
              </div>

              <Link
                href="/admin/archive"
                className="inline-flex rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-50"
              >
                Back to Past Years
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
