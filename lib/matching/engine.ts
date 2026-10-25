import { createAdminClient } from '@/lib/supabase/admin';

type RunType = 'initial' | 'rematch';

type Candidate = {
  sub: any;
  club: any;
  rating: any;
  score: number;
  fb: number;
  top: boolean;
  fallback?: boolean;
};

type AssignmentMaps = {
  assignedByStudent: Map<string, Candidate[]>;
  assignedByClub: Map<string, Candidate[]>;
  dayByStudent: Map<string, Set<string>>;
  titlesByStudent: Map<string, Set<string>>;
};

const STRONG_INTEREST_SCORE = 2;

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function studentGrade(candidate: Candidate) {
  return safeNumber(candidate.sub.students?.grade);
}

function maxClubsForSubmission(submission: any) {
  const value = safeNumber(submission.max_clubs);

  if (value <= 0) return 0;
  if (value >= 3) return 3;

  return Math.floor(value);
}

function submittedAtValue(submission: any) {
  return String(submission.submitted_at ?? '');
}

function interestScore(candidate: Candidate) {
  return safeNumber(candidate.rating?.interest_score);
}

function isStrongInterest(candidate: Candidate) {
  return interestScore(candidate) >= STRONG_INTEREST_SCORE;
}

function eligibleGradesForClub(club: any): number[] {
  if (club.grade_limited) {
    if (
      Array.isArray(club.eligible_grades) &&
      club.eligible_grades.length > 0
    ) {
      const grades = club.eligible_grades
        .map((grade: unknown) => safeNumber(grade))
        .filter((grade: number) => grade > 0);

      return Array.from(new Set<number>(grades)).sort(
        (a: number, b: number) => a - b
      );
    }

    if (club.eligible_grade) {
      return [safeNumber(club.eligible_grade)].filter(
        (grade: number) => grade > 0
      );
    }
  }

  return [3, 4, 5];
}

function isStudentEligibleForClub(submission: any, club: any) {
  const eligibleGrades = eligibleGradesForClub(club);

  if (!club.grade_limited) return true;

  return eligibleGrades.includes(safeNumber(submission.students?.grade));
}

function gradeBalanceCapForClub(club: any) {
  if (club.matching_preference !== 'grade_balance') return null;

  /*
   * Grade balance should ration scarce seats, not block unlimited fallback clubs.
   * If a club is unlimited, grade balance should not prevent an interested,
   * eligible student from being placed.
   */
  if (club.capacity_type !== 'limited') return null;

  const maxCapacity = safeNumber(club.max_capacity);

  if (maxCapacity <= 0) return null;

  const eligibleGrades = eligibleGradesForClub(club);

  if (eligibleGrades.length >= 3) return 0.4;
  if (eligibleGrades.length === 2) return 0.6;

  return null;
}

function gradeCountsForClub({
  club,
  assignedByClub,
}: {
  club: any;
  assignedByClub: Map<string, Candidate[]>;
}) {
  const eligibleGrades = eligibleGradesForClub(club);
  const counts = new Map<number, number>();

  for (const grade of eligibleGrades) {
    counts.set(grade, 0);
  }

  const assignments = assignedByClub.get(club.id) || [];

  for (const assignment of assignments) {
    const grade = studentGrade(assignment);

    if (!counts.has(grade)) {
      counts.set(grade, 0);
    }

    counts.set(grade, (counts.get(grade) ?? 0) + 1);
  }

  return counts;
}

function minGradeCount(counts: Map<number, number>) {
  if (counts.size === 0) return 0;
  return Math.min(...Array.from(counts.values()));
}

function maxGradeCount(counts: Map<number, number>) {
  if (counts.size === 0) return 0;
  return Math.max(...Array.from(counts.values()));
}

function gradeGap(counts: Map<number, number>) {
  if (counts.size === 0) return 0;
  return maxGradeCount(counts) - minGradeCount(counts);
}

function projectedGradeCounts({
  counts,
  grade,
}: {
  counts: Map<number, number>;
  grade: number;
}) {
  const projected = new Map(counts);
  projected.set(grade, (projected.get(grade) ?? 0) + 1);
  return projected;
}

function totalGradeCount(counts: Map<number, number>) {
  return Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
}

function gradeShare({
  counts,
  grade,
}: {
  counts: Map<number, number>;
  grade: number;
}) {
  const total = totalGradeCount(counts);
  if (total <= 0) return 0;

  return (counts.get(grade) ?? 0) / total;
}

function underrepresentedGrades(counts: Map<number, number>) {
  const minCount = minGradeCount(counts);

  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count === minCount)
      .map(([grade]) => grade)
  );
}

function hasMeetingDayConflict({
  studentId,
  club,
  dayByStudent,
}: {
  studentId: string;
  club: any;
  dayByStudent: Map<string, Set<string>>;
}) {
  const usedDays = dayByStudent.get(studentId) || new Set<string>();
  const meetingDays = Array.isArray(club.meeting_days) ? club.meeting_days : [];

  return meetingDays.some((day: string) => usedDays.has(day));
}

function hasDuplicateTitleConflict({
  studentId,
  club,
  titlesByStudent,
}: {
  studentId: string;
  club: any;
  titlesByStudent: Map<string, Set<string>>;
}) {
  const usedTitles = titlesByStudent.get(studentId) || new Set<string>();
  const title = String(club.club_title ?? '').toLowerCase();

  return usedTitles.has(title);
}

function clubIsAtCapacity({
  club,
  assignedByClub,
}: {
  club: any;
  assignedByClub: Map<string, Candidate[]>;
}) {
  if (club.capacity_type !== 'limited') return false;

  const maxCapacity = safeNumber(club.max_capacity);
  const clubAssignments = assignedByClub.get(club.id) || [];

  return maxCapacity > 0 && clubAssignments.length >= maxCapacity;
}

function basicCanAssignCandidateOnPass({
  candidate,
  passNumber,
  maps,
}: {
  candidate: Candidate;
  passNumber: number;
  maps: AssignmentMaps;
}) {
  const studentId = candidate.sub.student_id;
  const maxClubs = maxClubsForSubmission(candidate.sub);

  if (maxClubs < passNumber) return false;

  const studentAssignments = maps.assignedByStudent.get(studentId) || [];

  if (studentAssignments.length >= passNumber) return false;
  if (studentAssignments.length >= maxClubs) return false;

  if (
    studentAssignments.some(
      (assignment) => assignment.club.id === candidate.club.id
    )
  ) {
    return false;
  }

  if (
    clubIsAtCapacity({
      club: candidate.club,
      assignedByClub: maps.assignedByClub,
    })
  ) {
    return false;
  }

  if (
    hasMeetingDayConflict({
      studentId,
      club: candidate.club,
      dayByStudent: maps.dayByStudent,
    })
  ) {
    return false;
  }

  if (
    hasDuplicateTitleConflict({
      studentId,
      club: candidate.club,
      titlesByStudent: maps.titlesByStudent,
    })
  ) {
    return false;
  }

  return true;
}

function canReceiveThirdClub({
  candidate,
  maps,
}: {
  candidate: Candidate;
  maps: AssignmentMaps;
}) {
  if (!isStrongInterest(candidate)) return false;

  const studentAssignments =
    maps.assignedByStudent.get(candidate.sub.student_id) || [];

  if (studentAssignments.length < 2) return false;

  const hasTopChoice = studentAssignments.some((assignment) => assignment.top);

  if (!hasTopChoice) return false;

  const strongInterestAssignments = studentAssignments.filter((assignment) =>
    isStrongInterest(assignment)
  );

  return strongInterestAssignments.length >= 2;
}

function hasViableUnderrepresentedCandidate({
  candidate,
  passNumber,
  maps,
  candidates,
  underrepresented,
}: {
  candidate: Candidate;
  passNumber: number;
  maps: AssignmentMaps;
  candidates: Candidate[];
  underrepresented: Set<number>;
}) {
  for (const other of candidates) {
    if (other === candidate) continue;
    if (other.club.id !== candidate.club.id) continue;
    if (!underrepresented.has(studentGrade(other))) continue;

    /**
     * For relaxation, only treat strong-interest students as a reason to hold
     * the seat. This prevents weak-interest candidates from driving
     * grade-balance decisions.
     */
    if (!isStrongInterest(other)) continue;

    if (
      basicCanAssignCandidateOnPass({
        candidate: other,
        passNumber,
        maps,
      })
    ) {
      return true;
    }
  }

  return false;
}

function passesGradeBalanceRules({
  candidate,
  passNumber,
  maps,
  candidates,
}: {
  candidate: Candidate;
  passNumber: number;
  maps: AssignmentMaps;
  candidates: Candidate[];
}) {
  const cap = gradeBalanceCapForClub(candidate.club);

  if (cap === null) return true;

  const eligibleGrades = eligibleGradesForClub(candidate.club);

  if (eligibleGrades.length <= 1) return true;

  const grade = studentGrade(candidate);

  if (!eligibleGrades.includes(grade)) return true;

  const counts = gradeCountsForClub({
    club: candidate.club,
    assignedByClub: maps.assignedByClub,
  });

  const underrepresented = underrepresentedGrades(counts);
  const candidateIsUnderrepresented = underrepresented.has(grade);

  /**
   * Always allow students from currently underrepresented grades.
   * This is the main mechanism that pushes toward even distribution.
   */
  if (candidateIsUnderrepresented) return true;

  const projected = projectedGradeCounts({ counts, grade });

  const currentGap = gradeGap(counts);
  const projectedGap = gradeGap(projected);
  const projectedShare = gradeShare({ counts: projected, grade });

  /**
   * Weak-interest candidates should not make a grade-balanced club less balanced.
   * This is especially important for second/third assignments and low-demand
   * fill behavior.
   */
  if (!isStrongInterest(candidate) && projectedGap > currentGap) {
    return false;
  }

  /**
   * Enforce the grade-share cap strongly.
   * - 3 eligible grades: roughly no one grade over 40%
   * - 2 eligible grades: roughly no one grade over 60%
   */
  if (projectedShare <= cap) {
    return true;
  }

  const viableUnderrepresentedCandidate = hasViableUnderrepresentedCandidate({
    candidate,
    passNumber,
    maps,
    candidates,
    underrepresented,
  });

  if (viableUnderrepresentedCandidate) {
    return false;
  }

  /**
   * Relax only for strong-interest candidates when there is no viable
   * underrepresented-grade candidate available. This avoids leaving seats empty
   * when the club has unmet demand, while still preventing weak-interest
   * students from worsening imbalance.
   */
  if (!isStrongInterest(candidate)) {
    return false;
  }

  const relaxedCap = cap + 0.1;

  if (projectedShare > relaxedCap) {
    return false;
  }

  /**
   * Avoid large worsening of imbalance even during relaxation.
   */
  if (projectedGap > currentGap + 1) {
    return false;
  }

  return true;
}

function canAssignCandidateOnPass({
  candidate,
  passNumber,
  maps,
  candidates,
}: {
  candidate: Candidate;
  passNumber: number;
  maps: AssignmentMaps;
  candidates: Candidate[];
}) {
  if (
    !basicCanAssignCandidateOnPass({
      candidate,
      passNumber,
      maps,
    })
  ) {
    return false;
  }

  /**
   * Third clubs are intentionally rare:
   * - student must have requested 3 clubs
   * - student must already have top choice
   * - student must already have two strong-interest assignments
   * - third candidate must also be strong interest
   */
  if (passNumber === 3 && !canReceiveThirdClub({ candidate, maps })) {
    return false;
  }

  if (
    !passesGradeBalanceRules({
      candidate,
      passNumber,
      maps,
      candidates,
    })
  ) {
    return false;
  }

  return true;
}


function canAssignCandidateOnFinalFallback({
  candidate,
  maps,
}: {
  candidate: Candidate;
  maps: AssignmentMaps;
}) {
  const studentAssignments =
    maps.assignedByStudent.get(candidate.sub.student_id) || [];
  const nextPassNumber = studentAssignments.length + 1;

  /**
   * Final fallback still respects hard constraints handled by basicCanAssign:
   * requested club count, duplicate assignment, capacity, meeting day conflict,
   * and duplicate club title. It intentionally skips grade-balance rules and
   * the stricter third-club rule because its job is to avoid leaving students
   * unmatched or underassigned when a viable option remains.
   */
  return basicCanAssignCandidateOnPass({
    candidate,
    passNumber: nextPassNumber,
    maps,
  });
}

function runFinalFallbackPass({
  candidates,
  maps,
}: {
  candidates: Candidate[];
  maps: AssignmentMaps;
}) {
  let assignmentsMade = 0;
  let madeProgress = true;

  while (madeProgress) {
    madeProgress = false;

    for (const candidate of candidates) {
      const studentAssignments =
        maps.assignedByStudent.get(candidate.sub.student_id) || [];
      const maxClubs = maxClubsForSubmission(candidate.sub);

      if (studentAssignments.length >= maxClubs) continue;

      if (
        canAssignCandidateOnFinalFallback({
          candidate,
          maps,
        })
      ) {
        candidate.fallback = true;
        recordAssignment({
          candidate,
          maps,
        });
        assignmentsMade += 1;
        madeProgress = true;
      }
    }
  }

  return assignmentsMade;
}

function recordAssignment({
  candidate,
  maps,
}: {
  candidate: Candidate;
  maps: AssignmentMaps;
}) {
  const studentId = candidate.sub.student_id;
  const clubId = candidate.club.id;

  const studentAssignments = maps.assignedByStudent.get(studentId) || [];
  const clubAssignments = maps.assignedByClub.get(clubId) || [];

  studentAssignments.push(candidate);
  clubAssignments.push(candidate);

  maps.assignedByStudent.set(studentId, studentAssignments);
  maps.assignedByClub.set(clubId, clubAssignments);

  const usedDays = maps.dayByStudent.get(studentId) || new Set<string>();
  const meetingDays = Array.isArray(candidate.club.meeting_days)
    ? candidate.club.meeting_days
    : [];

  for (const day of meetingDays) {
    usedDays.add(day);
  }

  maps.dayByStudent.set(studentId, usedDays);

  const usedTitles = maps.titlesByStudent.get(studentId) || new Set<string>();
  usedTitles.add(String(candidate.club.club_title ?? '').toLowerCase());
  maps.titlesByStudent.set(studentId, usedTitles);
}

export async function runMatching(
  blockId: string,
  runType: RunType = 'initial'
) {
  const s = createAdminClient();

  const { data: currentBlock, error: blockError } = await s
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .single();

  if (blockError || !currentBlock) {
    throw new Error(
      `Could not load current block: ${blockError?.message ?? 'Not found'}`
    );
  }

  const { data: run, error: runError } = await s
    .from('match_runs')
    .insert({
      block_id: blockId,
      run_type: runType,
      status: 'running',
    })
    .select()
    .single();

  if (runError || !run) {
    throw runError ?? new Error('Could not create match run');
  }

  const [
    { data: clubsData = [], error: clubsError },
    { data: subsData = [], error: subsError },
    { data: historySnapshotsData = [], error: historyError },
    { data: cancelledData = [], error: cancelledError },
  ] = await Promise.all([
    s
      .from('club_offerings')
      .select('*')
      .eq('block_id', blockId)
      .eq('is_active', true)
      .eq('show_to_students', true),

    s
      .from('student_submissions')
      .select('*, student_interest_ratings(*), students(*)')
      .eq('block_id', blockId)
      .eq('is_latest', true),

    s
      .from('history_snapshots')
      .select(
        'id, block_id, school_year_id, committed_at, history_student_outcomes(*)'
      )
      .eq('school_year_id', currentBlock.school_year_id)
      .neq('block_id', blockId),

    s
      .from('below_minimum_decisions')
      .select('*')
      .eq('block_id', blockId)
      .eq('decision', 'cancel'),
  ]);

  if (clubsError) {
    throw new Error(`Could not load clubs: ${clubsError.message}`);
  }

  if (subsError) {
    throw new Error(`Could not load student submissions: ${subsError.message}`);
  }

  if (historyError) {
    throw new Error(`Could not load history snapshots: ${historyError.message}`);
  }

  if (cancelledError) {
    throw new Error(
      `Could not load below-minimum decisions: ${cancelledError.message}`
    );
  }

  const clubRows = (clubsData ?? []) as any[];
  const submissionRows = (subsData ?? []) as any[];
  const historySnapshotRows = (historySnapshotsData ?? []) as any[];
  const cancelledRows = (cancelledData ?? []) as any[];

  const cancelledIds = new Set(
    cancelledRows.map((decision) => decision.club_offering_id)
  );

  const usableClubs = clubRows.filter((club) => !cancelledIds.has(club.id));

  const clubsById = new Map<string, any>(
    usableClubs.map((club: any) => [club.id, club])
  );

  const maps: AssignmentMaps = {
    assignedByStudent: new Map<string, Candidate[]>(),
    assignedByClub: new Map<string, Candidate[]>(),
    dayByStudent: new Map<string, Set<string>>(),
    titlesByStudent: new Map<string, Set<string>>(),
  };

  const fairness = new Map<string, number>();

  for (const snapshot of historySnapshotRows) {
    const outcomes = Array.isArray(snapshot.history_student_outcomes)
      ? snapshot.history_student_outcomes
      : [];

    for (const outcome of outcomes) {
      const currentScore = fairness.get(outcome.student_id) || 0;
      const nextScore =
        currentScore +
        (outcome.zero_club_flag ? 1.5 : 0) +
        safeNumber(outcome.unmet_demand) * 0.35 -
        (outcome.got_top_choice ? 0.15 : 0);

      fairness.set(outcome.student_id, nextScore);
    }
  }

  const candidates: Candidate[] = [];

  for (const sub of submissionRows) {
    if (maxClubsForSubmission(sub) === 0) continue;

    const ratings = Array.isArray(sub.student_interest_ratings)
      ? sub.student_interest_ratings
      : [];

    for (const rating of ratings) {
      const ratingScore = safeNumber(rating.interest_score);

      if (ratingScore <= 0) continue;

      const club = clubsById.get(rating.club_offering_id);
      if (!club) continue;

      if (!isStudentEligibleForClub(sub, club)) continue;

      const fairnessBoost = fairness.get(sub.student_id) || 0;
      const isTopChoice = sub.top_choice_club_id === club.id;

      /**
       * Grade distribution is now handled dynamically during assignment.
       * Keep no static grade nudge here so grade_balance clubs are governed by
       * roster-aware distribution rules rather than a tiny score adjustment.
       */
      const gradeNudge = 0;

      candidates.push({
        sub,
        club,
        rating,
        score:
          ratingScore * 10 +
          (isTopChoice ? 5 : 0) +
          fairnessBoost +
          gradeNudge,
        fb: fairnessBoost,
        top: isTopChoice,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      submittedAtValue(a.sub).localeCompare(submittedAtValue(b.sub))
  );

  const maxRequestedClubs = Math.min(
    3,
    Math.max(
      0,
      ...submissionRows.map((sub) => maxClubsForSubmission(sub))
    )
  );

  for (let passNumber = 1; passNumber <= maxRequestedClubs; passNumber += 1) {
    for (const candidate of candidates) {
      if (
        canAssignCandidateOnPass({
          candidate,
          passNumber,
          maps,
          candidates,
        })
      ) {
        recordAssignment({
          candidate,
          maps,
        });
      }
    }
  }

  runFinalFallbackPass({
    candidates,
    maps,
  });

  const assignmentRows: any[] = [];

  for (const [studentId, assignments] of maps.assignedByStudent) {
    assignments.forEach((assignment, index) => {
      assignmentRows.push({
        match_run_id: run.id,
        student_id: studentId,
        club_offering_id: assignment.club.id,
        priority_score: assignment.score,
        fairness_boost: assignment.fb,
        was_top_choice: assignment.top,
        assignment_pass: assignment.fallback ? 99 : index + 1,
      });
    });
  }

  if (assignmentRows.length) {
    const { error: assignmentError } = await s
      .from('draft_assignments')
      .insert(assignmentRows);

    if (assignmentError) {
      throw new Error(
        `Could not create draft assignments: ${assignmentError.message}`
      );
    }
  }

  const demandRows = usableClubs.map((club: any) => {
    const positiveInterestCount = candidates.filter(
      (candidate) => candidate.club.id === club.id
    ).length;

    const assignedCount = (maps.assignedByClub.get(club.id) || []).length;

    return {
      match_run_id: run.id,
      club_offering_id: club.id,
      positive_interest_count: positiveInterestCount,
      assigned_count: assignedCount,
      below_minimum:
        Boolean(club.minimum_viable_enrollment) &&
        assignedCount < safeNumber(club.minimum_viable_enrollment),
      at_capacity:
        club.capacity_type === 'limited' &&
        assignedCount >= safeNumber(club.max_capacity),
    };
  });

  if (demandRows.length) {
    const { error: demandError } = await s
      .from('match_demand_summaries')
      .insert(demandRows);

    if (demandError) {
      throw new Error(
        `Could not create match demand summaries: ${demandError.message}`
      );
    }
  }

  await s
    .from('match_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', run.id);

  return run.id;
}