import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Severity = 'fail' | 'warn';

type AuditIssue = {
  severity: Severity;
  code: string;
  blockLabel: string;
  message: string;
  details?: Record<string, unknown>;
};

type AuditStats = {
  blocksAudited: number;
  studentsRequesting: number;
  studentsWithAtLeastOne: number;
  studentsWithZero: number;
  studentsWithMultiple: number;
  topChoiceCount: number;
  highInterestCount: number;
  totalAssignments: number;
  totalClubs: number;
};

type BlockRow = {
  id: string;
  label: string | null;
  school_year_id: string;
};

type ClubRow = {
  id: string;
  block_id: string;
  club_title: string | null;
  section_label: string | null;
  meeting_days: string[] | null;
  capacity_type: string | null;
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  grade_limited: boolean | null;
  eligible_grades: number[] | null;
  eligible_grade: number | null;
  matching_preference: string | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
};

type SubmissionRow = {
  id: string;
  block_id: string;
  student_id: string;
  max_clubs: number | null;
  top_choice_club_id: string | null;
  is_latest: boolean | null;
  students?: {
    id: string;
    student_name: string | null;
    grade: number | null;
    teacher_homeroom_text: string | null;
    school_year_id: string | null;
  } | null;
  student_interest_ratings?: Array<{
    club_offering_id: string;
    interest_score: number | null;
  }> | null;
};

type AssignmentRow = {
  id: string;
  block_id: string;
  student_id: string;
  club_offering_id: string;
  students?: {
    id: string;
    student_name: string | null;
    grade: number | null;
    teacher_homeroom_text: string | null;
    school_year_id: string | null;
  } | null;
  club_offerings?: ClubRow | null;
};

loadLocalEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const prefix = process.env.SIM_PREFIX || 'SIM';
const schoolYearId = process.env.SIM_SCHOOL_YEAR_ID || '';
const auditAllBlocks = process.argv.includes('--all-blocks');
const auditCurrentOnly = process.argv.includes('--current-only');

if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.');
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const blocks = await loadBlocksToAudit(supabase);

  if (blocks.length === 0) {
    console.log('No blocks found to audit.');
    return;
  }

  const allIssues: AuditIssue[] = [];
  const totals: AuditStats = {
    blocksAudited: 0,
    studentsRequesting: 0,
    studentsWithAtLeastOne: 0,
    studentsWithZero: 0,
    studentsWithMultiple: 0,
    topChoiceCount: 0,
    highInterestCount: 0,
    totalAssignments: 0,
    totalClubs: 0,
  };

  console.log(`Auditing ${blocks.length} block${blocks.length === 1 ? '' : 's'}...`);

  for (const block of blocks) {
    const result = await auditBlock(supabase, block);
    allIssues.push(...result.issues);
    addStats(totals, result.stats);
  }

  printSummary(totals, allIssues);

  const hardFailures = allIssues.filter((issue) => issue.severity === 'fail');
  if (hardFailures.length > 0) {
    process.exitCode = 1;
  }
}

async function loadBlocksToAudit(s: SupabaseClient): Promise<BlockRow[]> {
  let query = s.from('blocks').select('id, label, school_year_id, is_current');

  if (schoolYearId) {
    query = query.eq('school_year_id', schoolYearId);
  }

  if (auditCurrentOnly) {
    query = query.eq('is_current', true);
  } else if (!auditAllBlocks) {
    query = query.ilike('label', `${prefix} Block %`);
  }

  const { data, error } = await query.order('label', { ascending: true });

  if (error) {
    throw new Error(`Could not load blocks: ${error.message}`);
  }

  return (data ?? []).map((block: any) => ({
    id: String(block.id),
    label: block.label ?? null,
    school_year_id: String(block.school_year_id),
  }));
}

async function auditBlock(s: SupabaseClient, block: BlockRow) {
  const blockLabel = block.label ?? block.id;

  const [
    { data: clubsData = [], error: clubsError },
    { data: submissionsData = [], error: submissionsError },
    { data: assignmentsData = [], error: assignmentsError },
    { data: decisionsData = [], error: decisionsError },
  ] = await Promise.all([
    s.from('club_offerings').select('*').eq('block_id', block.id),
    s
      .from('student_submissions')
      .select('*, students(id, student_name, grade, teacher_homeroom_text, school_year_id), student_interest_ratings(club_offering_id, interest_score)')
      .eq('block_id', block.id)
      .eq('is_latest', true),
    s
      .from('final_assignments')
      .select('*, students(id, student_name, grade, teacher_homeroom_text, school_year_id), club_offerings(*)')
      .eq('block_id', block.id),
    s.from('below_minimum_decisions').select('*').eq('block_id', block.id),
  ]);

  if (clubsError) throw new Error(`Could not load clubs for ${blockLabel}: ${clubsError.message}`);
  if (submissionsError) throw new Error(`Could not load student choices for ${blockLabel}: ${submissionsError.message}`);
  if (assignmentsError) throw new Error(`Could not load final rosters for ${blockLabel}: ${assignmentsError.message}`);
  if (decisionsError) throw new Error(`Could not load small-club decisions for ${blockLabel}: ${decisionsError.message}`);

  const clubs = (clubsData ?? []) as ClubRow[];
  const submissions = (submissionsData ?? []) as SubmissionRow[];
  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const decisions = (decisionsData ?? []) as any[];

  const issues: AuditIssue[] = [];
  const clubsById = new Map(clubs.map((club) => [club.id, club]));
  const submissionsByStudentId = new Map(submissions.map((sub) => [sub.student_id, sub]));
  const cancelledClubIds = new Set(
    decisions.filter((decision) => decision.decision === 'cancel').map((decision) => decision.club_offering_id)
  );

  const assignmentsByStudent = groupBy(assignments, (assignment) => assignment.student_id);
  const assignmentsByClub = groupBy(assignments, (assignment) => assignment.club_offering_id);

  auditAssignments({ block, blockLabel, assignments, clubsById, submissionsByStudentId, cancelledClubIds, issues });
  auditStudentSchedules({ blockLabel, assignmentsByStudent, submissionsByStudentId, issues });
  auditClubCapacity({ blockLabel, clubs, assignmentsByClub, cancelledClubIds, issues });
  auditAccessFairness({ blockLabel, submissions, assignmentsByStudent, clubsById, cancelledClubIds, issues });
  auditGradeBalance({ blockLabel, clubs, assignmentsByClub, submissions, issues });

  const stats = buildStats({ submissions, assignmentsByStudent, assignments, clubs });

  printBlockSummary(blockLabel, stats, issues);

  return { issues, stats };
}

function auditAssignments({
  block,
  blockLabel,
  assignments,
  clubsById,
  submissionsByStudentId,
  cancelledClubIds,
  issues,
}: {
  block: BlockRow;
  blockLabel: string;
  assignments: AssignmentRow[];
  clubsById: Map<string, ClubRow>;
  submissionsByStudentId: Map<string, SubmissionRow>;
  cancelledClubIds: Set<string>;
  issues: AuditIssue[];
}) {
  const seenStudentClub = new Set<string>();

  for (const assignment of assignments) {
    const club = clubsById.get(assignment.club_offering_id) ?? assignment.club_offerings ?? null;
    const sub = submissionsByStudentId.get(assignment.student_id);
    const student = assignment.students;
    const key = `${assignment.student_id}:${assignment.club_offering_id}`;

    if (seenStudentClub.has(key)) {
      fail(issues, blockLabel, 'DUPLICATE_STUDENT_CLUB_ASSIGNMENT', 'A student has the same club more than once.', assignmentDetails(assignment));
    }
    seenStudentClub.add(key);

    if (assignment.block_id !== block.id) {
      fail(issues, blockLabel, 'ASSIGNMENT_WRONG_BLOCK', 'A roster spot belongs to the wrong block.', assignmentDetails(assignment));
    }

    if (!club) {
      fail(issues, blockLabel, 'MISSING_CLUB', 'A roster spot points to a missing club.', assignmentDetails(assignment));
      continue;
    }

    if (club.block_id !== block.id) {
      fail(issues, blockLabel, 'CLUB_WRONG_BLOCK', 'A roster spot points to a club from another block.', {
        ...assignmentDetails(assignment),
        clubBlockId: club.block_id,
      });
    }

    if (student?.school_year_id && student.school_year_id !== block.school_year_id) {
      fail(issues, blockLabel, 'STUDENT_WRONG_YEAR', 'A roster spot includes a student from another school year.', assignmentDetails(assignment));
    }

    if (club.is_active === false) {
      fail(issues, blockLabel, 'INACTIVE_CLUB_ASSIGNED', 'A roster spot was assigned to a closed club.', assignmentDetails(assignment));
    }

    if (club.show_to_students === false) {
      fail(issues, blockLabel, 'HIDDEN_CLUB_ASSIGNED', 'A roster spot was assigned to a club not shown to students.', assignmentDetails(assignment));
    }

    if (cancelledClubIds.has(club.id)) {
      fail(issues, blockLabel, 'CANCELED_CLUB_ASSIGNED', 'A roster spot was assigned to a canceled club.', assignmentDetails(assignment));
    }

    if (student && !studentEligibleForClub(student.grade, club)) {
      fail(issues, blockLabel, 'GRADE_INELIGIBLE_ASSIGNMENT', 'A student was assigned to a club outside their grade range.', assignmentDetails(assignment));
    }

    if (!sub) {
      fail(issues, blockLabel, 'ASSIGNED_WITHOUT_STUDENT_CHOICES', 'A student has a roster spot but no current student choices for this block.', assignmentDetails(assignment));
      continue;
    }

    const rating = ratingForClub(sub, club.id);
    if (rating <= 0) {
      fail(issues, blockLabel, 'UNREQUESTED_CLUB_ASSIGNED', 'A student was assigned to a club they did not choose.', assignmentDetails(assignment));
    }
  }
}

function auditStudentSchedules({
  blockLabel,
  assignmentsByStudent,
  submissionsByStudentId,
  issues,
}: {
  blockLabel: string;
  assignmentsByStudent: Map<string, AssignmentRow[]>;
  submissionsByStudentId: Map<string, SubmissionRow>;
  issues: AuditIssue[];
}) {
  for (const [studentId, assignments] of assignmentsByStudent.entries()) {
    const sub = submissionsByStudentId.get(studentId);
    const maxClubs = clampMaxClubs(sub?.max_clubs ?? 0);

    if (assignments.length > maxClubs) {
      fail(issues, blockLabel, 'STUDENT_OVER_MAX_CLUBS', 'A student received more clubs than requested.', {
        studentId,
        studentName: assignments[0]?.students?.student_name,
        assigned: assignments.length,
        requested: maxClubs,
      });
    }

    const days = new Map<string, AssignmentRow[]>();
    const titles = new Map<string, AssignmentRow[]>();

    for (const assignment of assignments) {
      const club = assignment.club_offerings;
      const meetingDays = Array.isArray(club?.meeting_days) ? club.meeting_days : [];

      for (const day of meetingDays) {
        const list = days.get(day) ?? [];
        list.push(assignment);
        days.set(day, list);
      }

      const title = String(club?.club_title ?? '').toLowerCase();
      if (title) {
        const list = titles.get(title) ?? [];
        list.push(assignment);
        titles.set(title, list);
      }
    }

    for (const [day, dayAssignments] of days.entries()) {
      if (dayAssignments.length > 1) {
        fail(issues, blockLabel, 'STUDENT_SAME_DAY_CONFLICT', 'A student has more than one club on the same day.', {
          studentId,
          studentName: assignments[0]?.students?.student_name,
          day,
          clubs: dayAssignments.map((assignment) => displayClubName(assignment.club_offerings)),
        });
      }
    }

    for (const [, titleAssignments] of titles.entries()) {
      if (titleAssignments.length > 1) {
        fail(issues, blockLabel, 'DUPLICATE_CLUB_TITLE_FOR_STUDENT', 'A student has multiple sections of the same club.', {
          studentId,
          studentName: assignments[0]?.students?.student_name,
          clubs: titleAssignments.map((assignment) => displayClubName(assignment.club_offerings)),
        });
      }
    }
  }
}

function auditClubCapacity({
  blockLabel,
  clubs,
  assignmentsByClub,
  cancelledClubIds,
  issues,
}: {
  blockLabel: string;
  clubs: ClubRow[];
  assignmentsByClub: Map<string, AssignmentRow[]>;
  cancelledClubIds: Set<string>;
  issues: AuditIssue[];
}) {
  for (const club of clubs) {
    const assigned = assignmentsByClub.get(club.id) ?? [];

    if (cancelledClubIds.has(club.id) && assigned.length > 0) {
      fail(issues, blockLabel, 'CANCELED_CLUB_HAS_ROSTER', 'A canceled club has students on its roster.', {
        club: displayClubName(club),
        assigned: assigned.length,
      });
    }

    if (club.capacity_type === 'limited') {
      const maxCapacity = safeNumber(club.max_capacity);
      if (maxCapacity > 0 && assigned.length > maxCapacity) {
        fail(issues, blockLabel, 'CLUB_OVER_CAPACITY', 'A club has more students than available spots.', {
          club: displayClubName(club),
          assigned: assigned.length,
          spots: maxCapacity,
        });
      }
    }

    const minimum = safeNumber(club.minimum_viable_enrollment);
    if (minimum > 0 && assigned.length > 0 && assigned.length < minimum && !cancelledClubIds.has(club.id)) {
      warn(issues, blockLabel, 'SMALL_CLUB_RUNNING', 'A small club is running below its minimum.', {
        club: displayClubName(club),
        assigned: assigned.length,
        minimum,
      });
    }
  }
}

function auditAccessFairness({
  blockLabel,
  submissions,
  assignmentsByStudent,
  clubsById,
  cancelledClubIds,
  issues,
}: {
  blockLabel: string;
  submissions: SubmissionRow[];
  assignmentsByStudent: Map<string, AssignmentRow[]>;
  clubsById: Map<string, ClubRow>;
  cancelledClubIds: Set<string>;
  issues: AuditIssue[];
}) {
  const requesting = submissions.filter((sub) => clampMaxClubs(sub.max_clubs ?? 0) > 0);
  const zeroClubStudents = requesting.filter((sub) => (assignmentsByStudent.get(sub.student_id) ?? []).length === 0);
  const studentsWithMultiple = requesting.filter((sub) => (assignmentsByStudent.get(sub.student_id) ?? []).length > 1);

  for (const sub of zeroClubStudents) {
    const viableChoices = viablePositiveChoices(sub, clubsById, cancelledClubIds);
    warn(issues, blockLabel, 'ZERO_CLUB_STUDENT', 'A student wanted clubs but received none.', {
      student: sub.students?.student_name,
      grade: sub.students?.grade,
      homeroom: sub.students?.teacher_homeroom_text,
      viableChoices,
    });
  }

  if (zeroClubStudents.length > 0 && studentsWithMultiple.length > 0) {
    warn(issues, blockLabel, 'ZERO_CLUB_WHILE_OTHERS_HAVE_MULTIPLE', 'Some students received no club while others received multiple clubs.', {
      zeroClubStudents: zeroClubStudents.length,
      studentsWithMultiple: studentsWithMultiple.length,
    });
  }
}

function auditGradeBalance({
  blockLabel,
  clubs,
  assignmentsByClub,
  submissions,
  issues,
}: {
  blockLabel: string;
  clubs: ClubRow[];
  assignmentsByClub: Map<string, AssignmentRow[]>;
  submissions: SubmissionRow[];
  issues: AuditIssue[];
}) {
  const submissionsByGradeByClub = new Map<string, Map<number, number>>();

  for (const sub of submissions) {
    const grade = safeNumber(sub.students?.grade);
    for (const rating of sub.student_interest_ratings ?? []) {
      if (safeNumber(rating.interest_score) < 2) continue;
      const map = submissionsByGradeByClub.get(rating.club_offering_id) ?? new Map<number, number>();
      map.set(grade, (map.get(grade) ?? 0) + 1);
      submissionsByGradeByClub.set(rating.club_offering_id, map);
    }
  }

  for (const club of clubs) {
    if (club.matching_preference !== 'grade_balance') continue;

    const assigned = assignmentsByClub.get(club.id) ?? [];
    if (assigned.length < 6) continue;

    const assignedByGrade = new Map<number, number>();
    for (const assignment of assigned) {
      const grade = safeNumber(assignment.students?.grade);
      assignedByGrade.set(grade, (assignedByGrade.get(grade) ?? 0) + 1);
    }

    const interestByGrade = submissionsByGradeByClub.get(club.id) ?? new Map<number, number>();
    const gradesWithInterest = Array.from(interestByGrade.entries()).filter(([, count]) => count >= 2).map(([grade]) => grade);
    if (gradesWithInterest.length < 2) continue;

    const counts = gradesWithInterest.map((grade) => assignedByGrade.get(grade) ?? 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);

    if (max - min >= 5) {
      warn(issues, blockLabel, 'GRADE_BALANCE_SKEW', 'A grade-balance club may be uneven across grades.', {
        club: displayClubName(club),
        assignedByGrade: Object.fromEntries(assignedByGrade),
        strongInterestByGrade: Object.fromEntries(interestByGrade),
      });
    }
  }
}

function buildStats({
  submissions,
  assignmentsByStudent,
  assignments,
  clubs,
}: {
  submissions: SubmissionRow[];
  assignmentsByStudent: Map<string, AssignmentRow[]>;
  assignments: AssignmentRow[];
  clubs: ClubRow[];
}): AuditStats {
  const requesting = submissions.filter((sub) => clampMaxClubs(sub.max_clubs ?? 0) > 0);
  let studentsWithAtLeastOne = 0;
  let studentsWithZero = 0;
  let studentsWithMultiple = 0;
  let topChoiceCount = 0;
  let highInterestCount = 0;

  for (const sub of requesting) {
    const assigned = assignmentsByStudent.get(sub.student_id) ?? [];
    if (assigned.length > 0) studentsWithAtLeastOne += 1;
    if (assigned.length === 0) studentsWithZero += 1;
    if (assigned.length > 1) studentsWithMultiple += 1;
    if (sub.top_choice_club_id && assigned.some((assignment) => assignment.club_offering_id === sub.top_choice_club_id)) {
      topChoiceCount += 1;
    }
    if (assigned.some((assignment) => ratingForClub(sub, assignment.club_offering_id) >= 2)) {
      highInterestCount += 1;
    }
  }

  return {
    blocksAudited: 1,
    studentsRequesting: requesting.length,
    studentsWithAtLeastOne,
    studentsWithZero,
    studentsWithMultiple,
    topChoiceCount,
    highInterestCount,
    totalAssignments: assignments.length,
    totalClubs: clubs.length,
  };
}

function viablePositiveChoices(sub: SubmissionRow, clubsById: Map<string, ClubRow>, cancelledClubIds: Set<string>) {
  return (sub.student_interest_ratings ?? [])
    .filter((rating) => safeNumber(rating.interest_score) > 0)
    .map((rating) => clubsById.get(rating.club_offering_id))
    .filter((club): club is ClubRow => Boolean(club))
    .filter((club) => !cancelledClubIds.has(club.id))
    .filter((club) => club.is_active !== false && club.show_to_students !== false)
    .filter((club) => studentEligibleForClub(sub.students?.grade ?? null, club))
    .map((club) => displayClubName(club));
}

function studentEligibleForClub(grade: number | null | undefined, club: ClubRow) {
  if (!club.grade_limited) return true;
  const studentGrade = safeNumber(grade);
  const eligibleGrades = Array.isArray(club.eligible_grades) && club.eligible_grades.length > 0
    ? club.eligible_grades.map(safeNumber)
    : club.eligible_grade
      ? [safeNumber(club.eligible_grade)]
      : [];

  return eligibleGrades.includes(studentGrade);
}

function ratingForClub(sub: SubmissionRow, clubId: string) {
  const rating = (sub.student_interest_ratings ?? []).find((row) => row.club_offering_id === clubId);
  return safeNumber(rating?.interest_score);
}

function clampMaxClubs(value: unknown) {
  const n = safeNumber(value);
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return Math.floor(n);
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function displayClubName(club: ClubRow | null | undefined) {
  return [club?.club_title, club?.section_label].filter(Boolean).join(' — ') || 'Unknown club';
}

function assignmentDetails(assignment: AssignmentRow) {
  return {
    assignmentId: assignment.id,
    studentId: assignment.student_id,
    studentName: assignment.students?.student_name,
    clubId: assignment.club_offering_id,
    club: displayClubName(assignment.club_offerings),
  };
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function fail(issues: AuditIssue[], blockLabel: string, code: string, message: string, details?: Record<string, unknown>) {
  issues.push({ severity: 'fail', code, blockLabel, message, details });
}

function warn(issues: AuditIssue[], blockLabel: string, code: string, message: string, details?: Record<string, unknown>) {
  issues.push({ severity: 'warn', code, blockLabel, message, details });
}

function addStats(total: AuditStats, next: AuditStats) {
  total.blocksAudited += next.blocksAudited;
  total.studentsRequesting += next.studentsRequesting;
  total.studentsWithAtLeastOne += next.studentsWithAtLeastOne;
  total.studentsWithZero += next.studentsWithZero;
  total.studentsWithMultiple += next.studentsWithMultiple;
  total.topChoiceCount += next.topChoiceCount;
  total.highInterestCount += next.highInterestCount;
  total.totalAssignments += next.totalAssignments;
  total.totalClubs += next.totalClubs;
}

function pct(numerator: number, denominator: number) {
  if (denominator <= 0) return '—';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function printBlockSummary(blockLabel: string, stats: AuditStats, issues: AuditIssue[]) {
  const failures = issues.filter((issue) => issue.blockLabel === blockLabel && issue.severity === 'fail');
  const warnings = issues.filter((issue) => issue.blockLabel === blockLabel && issue.severity === 'warn');

  console.log(`\n${blockLabel}`);
  console.log(`  Assignments: ${stats.totalAssignments}`);
  console.log(`  Students with at least 1 club: ${stats.studentsWithAtLeastOne}/${stats.studentsRequesting} (${pct(stats.studentsWithAtLeastOne, stats.studentsRequesting)})`);
  console.log(`  Top choice: ${stats.topChoiceCount}/${stats.studentsRequesting} (${pct(stats.topChoiceCount, stats.studentsRequesting)})`);
  console.log(`  High-interest club: ${stats.highInterestCount}/${stats.studentsRequesting} (${pct(stats.highInterestCount, stats.studentsRequesting)})`);
  console.log(`  Hard failures: ${failures.length}`);
  console.log(`  Review warnings: ${warnings.length}`);

  for (const issue of [...failures, ...warnings].slice(0, 8)) {
    const icon = issue.severity === 'fail' ? '❌' : '⚠️';
    console.log(`  ${icon} ${issue.code}: ${issue.message}`);
    if (issue.details) {
      console.log(`     ${JSON.stringify(issue.details)}`);
    }
  }

  if (failures.length + warnings.length > 8) {
    console.log(`  ...and ${failures.length + warnings.length - 8} more issue(s).`);
  }
}

function printSummary(stats: AuditStats, issues: AuditIssue[]) {
  const failures = issues.filter((issue) => issue.severity === 'fail');
  const warnings = issues.filter((issue) => issue.severity === 'warn');

  console.log('\n=== Match audit summary ===');
  console.log(`Blocks audited: ${stats.blocksAudited}`);
  console.log(`Clubs audited: ${stats.totalClubs}`);
  console.log(`Roster spots: ${stats.totalAssignments}`);
  console.log(`Students with at least 1 club: ${stats.studentsWithAtLeastOne}/${stats.studentsRequesting} (${pct(stats.studentsWithAtLeastOne, stats.studentsRequesting)})`);
  console.log(`Students with no club: ${stats.studentsWithZero}`);
  console.log(`Students with multiple clubs: ${stats.studentsWithMultiple}`);
  console.log(`Top choice: ${stats.topChoiceCount}/${stats.studentsRequesting} (${pct(stats.topChoiceCount, stats.studentsRequesting)})`);
  console.log(`High-interest club: ${stats.highInterestCount}/${stats.studentsRequesting} (${pct(stats.highInterestCount, stats.studentsRequesting)})`);
  console.log(`Hard failures: ${failures.length}`);
  console.log(`Review warnings: ${warnings.length}`);

  if (failures.length === 0) {
    console.log('\n✅ No hard rule violations found.');
  } else {
    console.log('\n❌ Hard rule violations found. Review before trusting this match.');
  }

  if (warnings.length > 0) {
    console.log('⚠️ Review warnings are not always wrong, but they are worth checking.');
  }
}

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error('\nMatch audit failed.');
  console.error(error);
  process.exit(1);
});
