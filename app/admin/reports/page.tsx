import { requireRole, getActiveContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type Tone = 'green' | 'yellow' | 'red' | 'blue' | 'slate';

function toneClasses(tone: Tone) {
  if (tone === 'green') return 'border-green-200 bg-green-50 text-green-900';
  if (tone === 'yellow') return 'border-yellow-200 bg-yellow-50 text-yellow-900';
  if (tone === 'red') return 'border-red-200 bg-red-50 text-red-900';
  if (tone === 'blue') return 'border-blue-200 bg-blue-50 text-blue-900';
  return 'border-slate-200 bg-white text-slate-900';
}

function topChoiceTone(rate: number): Tone {
  if (rate >= 60) return 'green';
  if (rate >= 40) return 'yellow';
  return 'red';
}

function highInterestTone(rate: number): Tone {
  if (rate >= 80) return 'green';
  if (rate >= 65) return 'yellow';
  return 'red';
}

function zeroClubTone(rate: number): Tone {
  if (rate <= 5) return 'green';
  if (rate <= 10) return 'yellow';
  return 'red';
}

function cancelledTone(rate: number): Tone {
  if (rate <= 10) return 'green';
  if (rate <= 20) return 'yellow';
  return 'red';
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'slate',
}: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses(tone)}`}>
      <div className="text-sm font-medium opacity-80">{label}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {detail ? <div className="mt-1 text-sm opacity-80">{detail}</div> : null}
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  tone = 'blue',
}: {
  label: string;
  value: number;
  total: number;
  tone?: Tone;
}) {
  const percentage = pct(value, total);
  const barColor =
    tone === 'green'
      ? 'bg-green-500'
      : tone === 'yellow'
        ? 'bg-yellow-500'
        : tone === 'red'
          ? 'bg-red-500'
          : 'bg-blue-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="font-medium">
          {value} / {total} ({percentage}%)
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, percentage)}%` }} />
      </div>
    </div>
  );
}

function DistributionBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const width = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;

  return (
    <div className="grid grid-cols-[5rem_1fr_4rem] items-center gap-3 text-sm">
      <div className="font-medium">{label}</div>
      <div className="h-8 overflow-hidden rounded-xl bg-slate-100">
        <div className="h-full rounded-xl bg-blue-500" style={{ width: `${width}%` }} />
      </div>
      <div className="text-right font-semibold">{value}</div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function ReportsPage() {
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();
  const supabase = await createClient();

  if (!year || !block) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No active school year or current session was found.
        </div>
      </div>
    );
  }

  const { data: run } = await supabase
    .from('match_runs')
    .select('*')
    .eq('block_id', block.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review roster results after matching has been run.
        </p>
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No completed matching run was found for the current session.
        </div>
      </div>
    );
  }

  const [
    { data: clubs = [] },
    { data: demandRows = [] },
    { data: decisions = [] },
    { data: draftAssignments = [] },
    { data: finalAssignments = [] },
    { data: submissions = [] },
    { data: snapshots = [] },
  ] = await Promise.all([
    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', block.id)
      .eq('is_active', true)
      .eq('show_to_students', true),
    supabase
      .from('match_demand_summaries')
      .select('*, club_offerings(*)')
      .eq('match_run_id', run.id),
    supabase.from('below_minimum_decisions').select('*').eq('block_id', block.id),
    supabase.from('draft_assignments').select('*').eq('match_run_id', run.id),
    supabase.from('final_assignments').select('*').eq('block_id', block.id),
    supabase
      .from('student_submissions')
      .select('*, student_interest_ratings(*), students(grade, teacher_homeroom_text)')
      .eq('block_id', block.id)
      .eq('is_latest', true),
    supabase
      .from('history_snapshots')
      .select('id, block_id, school_year_id, committed_at, history_student_outcomes(*)')
      .eq('school_year_id', year.id)
      .order('committed_at', { ascending: false }),
  ]);

  const cancelledClubIds = new Set(
    (decisions as any[])
      .filter((decision) => decision.decision === 'cancel')
      .map((decision) => decision.club_offering_id)
  );

  const rosterSource = (finalAssignments as any[]).length > 0 ? 'final' : 'draft';
  const effectiveAssignments =
    rosterSource === 'final'
      ? (finalAssignments as any[])
      : (draftAssignments as any[]).filter(
          (assignment) => !cancelledClubIds.has(assignment.club_offering_id)
        );

  const assignmentsByStudent = new Map<string, any[]>();
  const assignmentsByClub = new Map<string, any[]>();

  for (const assignment of effectiveAssignments) {
    const studentList = assignmentsByStudent.get(assignment.student_id) ?? [];
    studentList.push(assignment);
    assignmentsByStudent.set(assignment.student_id, studentList);

    const clubList = assignmentsByClub.get(assignment.club_offering_id) ?? [];
    clubList.push(assignment);
    assignmentsByClub.set(assignment.club_offering_id, clubList);
  }

  const allClubs = clubs as any[];
  const totalClubs = allClubs.length;
  const cancelledCount = cancelledClubIds.size;
  const activeNonCancelledClubs = allClubs.filter((club) => !cancelledClubIds.has(club.id));

  const clubsAtCapacity = activeNonCancelledClubs.filter((club) => {
    if (club.capacity_type !== 'limited') return false;
    return (assignmentsByClub.get(club.id) ?? []).length >= safeNumber(club.max_capacity);
  }).length;

  const clubsWithOpenSeats = activeNonCancelledClubs.filter((club) => {
    if (club.capacity_type !== 'limited') return false;
    return (assignmentsByClub.get(club.id) ?? []).length < safeNumber(club.max_capacity);
  }).length;

  const zeroEnrollmentClubs = activeNonCancelledClubs.filter(
    (club) => (assignmentsByClub.get(club.id) ?? []).length === 0
  ).length;

  const underMinimumRows = (demandRows as any[]).filter(
    (row) => row.below_minimum && !cancelledClubIds.has(row.club_offering_id)
  );

  const cancelledRate = pct(cancelledCount, totalClubs);

  const requestedSubmissions = (submissions as any[]).filter(
    (submission) => safeNumber(submission.max_clubs) > 0
  );
  const requestingStudents = requestedSubmissions.length;

  const assignedCountDistribution = new Map<number, number>([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ]);

  let gotTopChoiceCount = 0;
  let gotHighInterestCount = 0;
  let gotPositiveInterestCount = 0;
  let unmetDemandCount = 0;
  let totalUnmetDemand = 0;

  const currentOutcomeByStudent = new Map<
    string,
    { gotTopChoice: boolean; clubsReceived: number; unmetDemand: number; zeroClub: boolean }
  >();

  for (const submission of requestedSubmissions) {
    const studentAssignments = assignmentsByStudent.get(submission.student_id) ?? [];
    const clubsReceived = studentAssignments.length;
    const bucket = Math.min(3, clubsReceived);
    assignedCountDistribution.set(bucket, (assignedCountDistribution.get(bucket) ?? 0) + 1);

    const gotTopChoice = Boolean(
      submission.top_choice_club_id &&
        studentAssignments.some(
          (assignment) => assignment.club_offering_id === submission.top_choice_club_id
        )
    );

    const ratings = Array.isArray(submission.student_interest_ratings)
      ? submission.student_interest_ratings
      : [];

    const ratingByClub = new Map(
      ratings.map((rating: any) => [rating.club_offering_id, safeNumber(rating.interest_score)])
    );

    const gotHighInterest = studentAssignments.some(
      (assignment) => safeNumber(ratingByClub.get(assignment.club_offering_id)) >= 2
    );

    const gotPositiveInterest = studentAssignments.some(
      (assignment) => safeNumber(ratingByClub.get(assignment.club_offering_id)) > 0
    );

    const unmetDemand = Math.max(0, safeNumber(submission.max_clubs) - clubsReceived);

    if (gotTopChoice) gotTopChoiceCount += 1;
    if (gotHighInterest) gotHighInterestCount += 1;
    if (gotPositiveInterest) gotPositiveInterestCount += 1;
    if (unmetDemand > 0) unmetDemandCount += 1;
    totalUnmetDemand += unmetDemand;

    currentOutcomeByStudent.set(submission.student_id, {
      gotTopChoice,
      clubsReceived,
      unmetDemand,
      zeroClub: clubsReceived === 0,
    });
  }

  const zeroClubCount = assignedCountDistribution.get(0) ?? 0;
  const oneClubCount = assignedCountDistribution.get(1) ?? 0;
  const twoClubCount = assignedCountDistribution.get(2) ?? 0;
  const threeClubCount = assignedCountDistribution.get(3) ?? 0;

  const topChoiceRate = pct(gotTopChoiceCount, requestingStudents);
  const highInterestRate = pct(gotHighInterestCount, requestingStudents);
  const positiveInterestRate = pct(gotPositiveInterestCount, requestingStudents);
  const zeroClubRate = pct(zeroClubCount, requestingStudents);
  const unmetDemandRate = pct(unmetDemandCount, requestingStudents);

  const previousSnapshot = (snapshots as any[]).find((snapshot) => snapshot.block_id !== block.id);
  const previousOutcomes = Array.isArray(previousSnapshot?.history_student_outcomes)
    ? previousSnapshot.history_student_outcomes
    : [];

  let priorMissTopNowTop = 0;
  let priorZeroNowAny = 0;
  let repeatZero = 0;

  for (const prior of previousOutcomes) {
    const current = currentOutcomeByStudent.get(prior.student_id);
    if (!current) continue;

    if (!prior.got_top_choice && current.gotTopChoice) priorMissTopNowTop += 1;
    if (prior.zero_club_flag && current.clubsReceived > 0) priorZeroNowAny += 1;
    if (prior.zero_club_flag && current.zeroClub) repeatZero += 1;
  }

  const gradeRows = [3, 4, 5].map((grade) => {
    const gradeSubs = requestedSubmissions.filter((submission) => submission.students?.grade === grade);
    const gradeAssignedAtLeastOne = gradeSubs.filter(
      (submission) => (assignmentsByStudent.get(submission.student_id) ?? []).length > 0
    ).length;
    const gradeTopChoice = gradeSubs.filter((submission) => {
      const studentAssignments = assignmentsByStudent.get(submission.student_id) ?? [];
      return Boolean(
        submission.top_choice_club_id &&
          studentAssignments.some(
            (assignment) => assignment.club_offering_id === submission.top_choice_club_id
          )
      );
    }).length;

    return {
      grade,
      requesting: gradeSubs.length,
      assignedAtLeastOne: gradeAssignedAtLeastOne,
      topChoice: gradeTopChoice,
    };
  });

  const mostRequestedClubs = [...(demandRows as any[])]
    .map((row) => ({
      ...row,
      unmetInterest: Math.max(0, safeNumber(row.positive_interest_count) - safeNumber(row.assigned_count)),
    }))
    .sort((a, b) => b.unmetInterest - a.unmetInterest)
    .slice(0, 5);

  const clubsWithMostOpenSeats = activeNonCancelledClubs
    .map((club) => {
      const assigned = (assignmentsByClub.get(club.id) ?? []).length;
      const capacity = club.capacity_type === 'limited' ? safeNumber(club.max_capacity) : null;
      const openSeats = capacity === null ? 0 : Math.max(0, capacity - assigned);
      return { club, assigned, capacity, openSeats };
    })
    .filter((row) => row.capacity !== null && row.openSeats > 0)
    .sort((a, b) => b.openSeats - a.openSeats)
    .slice(0, 5);

  const maxDistribution = Math.max(zeroClubCount, oneClubCount, twoClubCount, threeClubCount, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review roster results and look for patterns to improve future club sessions.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Current session:{' '}
          <span className="font-medium text-slate-700">
            {year.label} / {block.label}
          </span>
          {' '}/ Showing {rosterSource} rosters
        </p>
      </div>

      <Section title="Quick summary" description="The most useful numbers from the latest roster results.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Students who wanted clubs" value={requestingStudents} />
          <MetricCard
            label="Students with no club"
            value={`${zeroClubCount} (${zeroClubRate}%)`}
            detail="Among students who wanted clubs"
            tone={zeroClubTone(zeroClubRate)}
          />
          <MetricCard
            label="Got top choice"
            value={`${topChoiceRate}%`}
            detail={`${gotTopChoiceCount} students`}
            tone={topChoiceTone(topChoiceRate)}
          />
          <MetricCard
            label="Got a high-interest club"
            value={`${highInterestRate}%`}
            detail="Students got a club they really wanted"
            tone={highInterestTone(highInterestRate)}
          />
        </div>
      </Section>

      <Section title="Club summary" description="How club seats were used in this session.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Clubs offered" value={totalClubs} detail="Shown to students" />
          <MetricCard label="Full clubs" value={clubsAtCapacity} detail="Limited clubs that filled" tone="blue" />
          <MetricCard label="Small clubs" value={underMinimumRows.length} detail="Not including canceled clubs" tone={underMinimumRows.length > 0 ? 'yellow' : 'green'} />
          <MetricCard label="Canceled clubs" value={`${cancelledCount} (${cancelledRate}%)`} tone={cancelledTone(cancelledRate)} />
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Clubs per student" description="How many clubs students received, among students who wanted at least one club.">
          <div className="space-y-3">
            <DistributionBar label="0 clubs" value={zeroClubCount} max={maxDistribution} />
            <DistributionBar label="1 club" value={oneClubCount} max={maxDistribution} />
            <DistributionBar label="2 clubs" value={twoClubCount} max={maxDistribution} />
            <DistributionBar label="3 clubs" value={threeClubCount} max={maxDistribution} />
          </div>
        </Section>

        <Section title="Student choice results" description="How often students received clubs they were excited about.">
          <div className="space-y-4">
            <ProgressBar label="Got top choice" value={gotTopChoiceCount} total={requestingStudents} tone={topChoiceTone(topChoiceRate)} />
            <ProgressBar label="Got a high-interest club" value={gotHighInterestCount} total={requestingStudents} tone={highInterestTone(highInterestRate)} />
            <ProgressBar label="Got any club they chose" value={gotPositiveInterestCount} total={requestingStudents} tone="blue" />
            <ProgressBar label="Wanted more clubs than they received" value={unmetDemandCount} total={requestingStudents} tone={unmetDemandRate > 30 ? 'red' : unmetDemandRate > 15 ? 'yellow' : 'green'} />
          </div>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Open seats and unmet interest" description="Useful signals for planning the next club session.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Clubs with open seats" value={clubsWithOpenSeats} detail="Limited clubs not full" />
            <MetricCard label="Clubs with no students" value={zeroEnrollmentClubs} tone={zeroEnrollmentClubs >= 3 ? 'red' : zeroEnrollmentClubs > 0 ? 'yellow' : 'green'} />
            <MetricCard label="Total clubs still wanted" value={totalUnmetDemand} detail="Wanted clubs minus assigned clubs" tone={totalUnmetDemand > 50 ? 'red' : totalUnmetDemand > 25 ? 'yellow' : 'green'} />
            <MetricCard label="Got any chosen club" value={`${positiveInterestRate}%`} tone="blue" />
          </div>
        </Section>

        <Section title="Compared with earlier sessions" description="Uses the most recent saved session from this school year, if available.">
          {previousSnapshot ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Missed top choice before, got it now" value={priorMissTopNowTop} tone="green" />
              <MetricCard label="Had no club before, got one now" value={priorZeroNowAny} tone="green" />
              <MetricCard label="Still got no club" value={repeatZero} tone={repeatZero > 0 ? 'red' : 'green'} />
            </div>
          ) : (
            <div className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-700">
              No earlier saved session was found for this school year yet.
            </div>
          )}
        </Section>
      </div>

      <Section title="Grade check" description="A quick look at whether one grade may be underserved.">
        <div className="grid gap-4 md:grid-cols-3">
          {gradeRows.map((row) => (
            <div key={row.grade} className="rounded-xl border bg-slate-50 p-4">
              <div className="font-semibold">Grade {row.grade}</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between"><span>Wanted clubs</span><span className="font-medium">{row.requesting}</span></div>
                <div className="flex justify-between"><span>Got at least 1 club</span><span className="font-medium">{pct(row.assignedAtLeastOne, row.requesting)}%</span></div>
                <div className="flex justify-between"><span>Got top choice</span><span className="font-medium">{pct(row.topChoice, row.requesting)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <details className="rounded-2xl border bg-white">
        <summary className="cursor-pointer px-5 py-4 text-lg font-semibold text-slate-900">
          Show planning details
        </summary>
        <div className="space-y-6 border-t p-5">
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title="Most requested clubs" description="Clubs where student interest was higher than available spots.">
              <div className="space-y-2">
                {mostRequestedClubs.map((row: any) => (
                  <div key={row.club_offering_id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                    <div className="font-medium">{row.club_offerings?.club_title ?? 'Club'}</div>
                    <div className="text-slate-600">
                      Interested students: {row.positive_interest_count}; assigned: {row.assigned_count}; still wanted: {row.unmetInterest}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Largest open-seat opportunities" description="Clubs with the most unused spots.">
              <div className="space-y-2">
                {clubsWithMostOpenSeats.map((row) => (
                  <div key={row.club.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                    <div className="font-medium">{row.club.club_title}</div>
                    <div className="text-slate-600">
                      Students assigned: {row.assigned}; spots: {row.capacity}; open spots: {row.openSeats}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </details>
    </div>
  );
}
