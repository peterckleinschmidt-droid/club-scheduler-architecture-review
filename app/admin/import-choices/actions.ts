'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveContext, requireRole } from '@/lib/auth';
import {
  normalizeEmail,
  normalizeStudentCode,
  normalizeText,
  parseGrade,
  parseMaxClubs,
  parseStudentChoiceCsv,
  parseSubmittedAt,
  ratingToScore,
  submissionSortValue,
} from './import-parser';
import type {
  ImportClub,
  ImportCommitResult,
  ImportIdentityMode,
  ImportIssue,
  ImportPreview,
  ImportStudent,
  ImportTeacher,
  ParsedChoiceRow,
  ValidatedChoiceRow,
} from './types';

function emptyPreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  const preview: ImportPreview = {
    ok: false,
    yearLabel: null,
    blockLabel: null,
    totalRows: 0,
    validRows: [],
    issues: [],
    matchedStudentCount: 0,
    newStudentCount: 0,
    matchedHomeroomCount: 0,
    unmatchedHomeroomCount: 0,
    duplicateStudentCount: 0,
    replacedDuplicateRows: 0,
    detectedClubColumns: [],
  };

  return Object.assign(preview, overrides);
}

function participationPreferenceFromMaxClubs(maxClubs: number) {
  return ['none', 'one', 'two', 'three'][maxClubs] ?? 'one';
}

function valueForGradeSpecificColumn({
  row,
  baseColumn,
  grade,
}: {
  row: ParsedChoiceRow;
  baseColumn: 'Max Clubs' | 'Top Choice';
  grade: number;
}) {
  const gradeSpecificValue = row.raw[`${baseColumn} Grade ${grade}`];

  if (gradeSpecificValue && gradeSpecificValue.trim()) {
    return gradeSpecificValue.trim();
  }

  const genericValue = row.raw[baseColumn];

  if (genericValue && genericValue.trim()) {
    return genericValue.trim();
  }

  if (baseColumn === 'Max Clubs') {
    return row.maxClubs;
  }

  return row.topChoice;
}

function codedStudentDisplayName(studentCode: string) {
  return `Student ${studentCode}`;
}

function codedStudentEmail(studentCode: string) {
  const safeCode = studentCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${safeCode || 'coded-student'}@coded.local`;
}

function buildStudentIndexes(students: ImportStudent[]) {
  const byCode = new Map<string, ImportStudent>();
  const byEmail = new Map<string, ImportStudent>();
  const byNameGrade = new Map<string, ImportStudent[]>();
  const byName = new Map<string, ImportStudent[]>();

  students.forEach((student) => {
    const code = normalizeStudentCode(student.external_student_id);
    const email = normalizeEmail(student.student_email);
    const normalizedName = normalizeText(student.student_name);

    if (code) {
      byCode.set(code, student);
    }

    if (email) {
      byEmail.set(email, student);
    }

    if (normalizedName) {
      const gradeKey = `${normalizedName}|${student.grade ?? ''}`;

      byNameGrade.set(gradeKey, [...(byNameGrade.get(gradeKey) ?? []), student]);
      byName.set(normalizedName, [...(byName.get(normalizedName) ?? []), student]);
    }
  });

  return { byCode, byEmail, byNameGrade, byName };
}

function buildTeacherIndex(teachers: ImportTeacher[]) {
  const byName = new Map<string, ImportTeacher[]>();

  teachers.forEach((teacher) => {
    const key = normalizeText(teacher.teacher_name);

    if (key) {
      byName.set(key, [...(byName.get(key) ?? []), teacher]);
    }
  });

  return byName;
}

function importClubEligibleGrades(club: ImportClub) {
  if (!club.grade_limited) return [3, 4, 5];
  const listed = Array.isArray(club.eligible_grades)
    ? club.eligible_grades.map(Number).filter((grade) => [3, 4, 5].includes(grade))
    : [];
  if (listed.length > 0) return Array.from(new Set(listed));
  const legacy = Number(club.eligible_grade ?? 0);
  return [3, 4, 5].includes(legacy) ? [legacy] : [];
}
function importClubAllowsGrade(club: ImportClub, grade: number) {
  return !club.grade_limited || importClubEligibleGrades(club).includes(grade);
}
function buildClubIndex(clubs: ImportClub[]) {
  const byLabel = new Map<string, ImportClub[]>();

  clubs.forEach((club) => {
    const labels = [
      club.club_title,
      club.section_label ? `${club.club_title} ${club.section_label}` : null,
      club.section_label ? `${club.club_title} - ${club.section_label}` : null,
      club.section_label ? `${club.club_title} (${club.section_label})` : null,
    ].filter(Boolean) as string[];

    labels.forEach((label) => {
      const key = normalizeText(label);
      byLabel.set(key, [...(byLabel.get(key) ?? []), club]);
    });
  });

  return byLabel;
}

function matchStudent(row: ParsedChoiceRow, indexes: ReturnType<typeof buildStudentIndexes>) {
  const studentCode = normalizeStudentCode(row.studentCode);

  if (studentCode) {
    const match = indexes.byCode.get(studentCode);

    if (match) {
      return {
        student: match,
        warning: null as string | null,
        identityMode: 'coded' as ImportIdentityMode,
      };
    }

    return {
      student: null,
      warning: null as string | null,
      identityMode: 'coded' as ImportIdentityMode,
    };
  }

  const email = normalizeEmail(row.email);

  if (email) {
    const match = indexes.byEmail.get(email);

    if (match) {
      return {
        student: match,
        warning: null as string | null,
        identityMode: 'identifiable' as ImportIdentityMode,
      };
    }
  }

  const gradeNumber = parseGrade(row.grade);
  const name = normalizeText(row.studentName);
  const nameGradeKey = `${name}|${gradeNumber ?? ''}`;
  const nameGradeMatches = indexes.byNameGrade.get(nameGradeKey) ?? [];

  if (nameGradeMatches.length === 1) {
    return {
      student: nameGradeMatches[0],
      warning: email
        ? 'Student was matched by name and grade because the email did not match.'
        : null,
      identityMode: 'identifiable' as ImportIdentityMode,
    };
  }

  const nameMatches = indexes.byName.get(name) ?? [];

  if (nameMatches.length === 1) {
    return {
      student: nameMatches[0],
      warning:
        'Student was matched by name only. Check this row if there are students with similar names.',
      identityMode: 'identifiable' as ImportIdentityMode,
    };
  }

  return {
    student: null,
    warning: null as string | null,
    identityMode: 'identifiable' as ImportIdentityMode,
  };
}

function matchTeacher(homeroom: string, teacherIndex: Map<string, ImportTeacher[]>) {
  if (!homeroom.trim()) {
    return { teacher: null, ambiguous: false };
  }

  const matches = teacherIndex.get(normalizeText(homeroom)) ?? [];

  if (matches.length === 1) {
    return { teacher: matches[0], ambiguous: false };
  }

  if (matches.length > 1) {
    return { teacher: null, ambiguous: true };
  }

  return { teacher: null, ambiguous: false };
}

function findSingleClub(label: string, clubIndex: Map<string, ImportClub[]>) {
  if (!label.trim()) {
    return { club: null, ambiguous: false, matchedByTitleFallback: false };
  }

  const labels = [
    label,
    String(label).split(/\s+\/\s+/)[0] ?? '',
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const exactMatches = Array.from(
    new Map(
      labels
        .flatMap((key) => clubIndex.get(key) ?? [])
        .map((club) => [club.id, club])
    ).values()
  );

  if (exactMatches.length === 1) {
    return { club: exactMatches[0], ambiguous: false, matchedByTitleFallback: false };
  }
  if (exactMatches.length > 1) {
    return { club: null, ambiguous: true, matchedByTitleFallback: false };
  }

  const englishLabel = String(label).split(/\s+\/\s+/)[0] ?? '';
  const parentheticalMatch = englishLabel.trim().match(/^(.*?)\s*\([^()]+\)\s*$/);
  const baseTitle = parentheticalMatch?.[1]?.trim() ?? '';
  if (!baseTitle) {
    return { club: null, ambiguous: false, matchedByTitleFallback: false };
  }

  const titleMatches = Array.from(
    new Map(
      (clubIndex.get(normalizeText(baseTitle)) ?? []).map((club) => [club.id, club])
    ).values()
  );

  if (titleMatches.length === 1) {
    return { club: titleMatches[0], ambiguous: false, matchedByTitleFallback: true };
  }
  if (titleMatches.length > 1) {
    return { club: null, ambiguous: true, matchedByTitleFallback: false };
  }
  return { club: null, ambiguous: false, matchedByTitleFallback: false };
}

async function loadImportContext() {
  await requireRole(['admin']);

  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return {
      admin,
      year,
      block,
      students: [] as ImportStudent[],
      teachers: [] as ImportTeacher[],
      clubs: [] as ImportClub[],
      issues: [
        {
          rowNumber: null,
          severity: 'error' as const,
          message: 'No active school year or current session is configured.',
        },
      ],
    };
  }

  const [studentsResult, teachersResult, clubsResult] = await Promise.all([
    admin
      .from('students')
      .select(
        'id, student_email, student_name, grade, teacher_id, teacher_homeroom_text, external_student_id, is_active'
      )
      .eq('is_active', true)
      .order('student_name'),
    admin
      .from('teachers')
      .select('id, teacher_name, is_active')
      .eq('is_active', true)
      .order('teacher_name'),
    admin
      .from('club_offerings')
      .select(
        'id, club_title, section_label, is_active, show_to_students, grade_limited, eligible_grade, eligible_grades'
      )
      .eq('block_id', block.id)
      .eq('is_active', true)
      .eq('show_to_students', true)
      .order('club_title'),
  ]);

  const issues: ImportIssue[] = [];

  if (studentsResult.error) {
    issues.push({
      rowNumber: null,
      severity: 'error',
      message: `Could not load students: ${studentsResult.error.message}`,
    });
  }

  if (teachersResult.error) {
    issues.push({
      rowNumber: null,
      severity: 'error',
      message: `Could not load homerooms: ${teachersResult.error.message}`,
    });
  }

  if (clubsResult.error) {
    issues.push({
      rowNumber: null,
      severity: 'error',
      message: `Could not load clubs: ${clubsResult.error.message}`,
    });
  }

  return {
    admin,
    year,
    block,
    students: (studentsResult.data ?? []) as ImportStudent[],
    teachers: (teachersResult.data ?? []) as ImportTeacher[],
    clubs: (clubsResult.data ?? []) as ImportClub[],
    issues,
  };
}

export async function previewImportChoices(csvText: string): Promise<ImportPreview> {
  const context = await loadImportContext();
  const yearLabel = context.year?.label ?? null;
  const blockLabel = context.block?.label ?? null;

  if (context.issues.some((issue) => issue.severity === 'error')) {
    return emptyPreview({
      yearLabel,
      blockLabel,
      issues: context.issues,
    });
  }

  const parsed = parseStudentChoiceCsv(csvText);

  const issues: ImportIssue[] = [
    ...context.issues,
    ...parsed.headerErrors.map((message) => ({
      rowNumber: null,
      severity: 'error' as const,
      message,
    })),
  ];

  if (parsed.headerErrors.length > 0) {
    return emptyPreview({
      yearLabel,
      blockLabel,
      totalRows: parsed.rows.length,
      issues,
      detectedClubColumns: parsed.detectedClubColumns,
    });
  }

  if (context.clubs.length === 0) {
    issues.push({
      rowNumber: null,
      severity: 'error',
      message: 'No active clubs are visible to students for the current session.',
    });
  }

  const studentIndexes = buildStudentIndexes(context.students);
  const teacherIndex = buildTeacherIndex(context.teachers);
  const clubIndex = buildClubIndex(context.clubs);

  parsed.detectedClubColumns.forEach((column) => {
    const match = findSingleClub(column, clubIndex);
    if (match.ambiguous) {
      issues.push({
        rowNumber: null,
        severity: 'error',
        message: `The club column "${column}" matches more than one club. Rename the column or club section so it is unique.`,
      });
    } else if (!match.club) {
      issues.push({
        rowNumber: null,
        severity: 'error',
        message: `The club column "${column}" does not match a current club.`,
      });
    } else if (match.matchedByTitleFallback) {
      const currentLabel = match.club.section_label
        ? `${match.club.club_title} (${match.club.section_label})`
        : match.club.club_title;
      issues.push({
        rowNumber: null,
        severity: 'warning',
        message: `Older club label "${column}" was matched to the unique current club "${currentLabel}".`,
      });
    }
  });
  const validBeforeDuplicates: ValidatedChoiceRow[] = [];

  parsed.rows.forEach((row) => {
    const rowWarnings: string[] = [];
    const studentCode = normalizeStudentCode(row.studentCode);
    const email = normalizeEmail(row.email);
    const grade = parseGrade(row.grade);
    const identityMode: ImportIdentityMode = studentCode ? 'coded' : 'identifiable';

    if (!grade) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: 'Grade must be 3, 4, or 5.',
      });
      return;
    }

    if (identityMode === 'coded' && !studentCode) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: 'Missing Student Code for coded import.',
      });
      return;
    }

    if (identityMode === 'identifiable' && !email && !row.studentName.trim()) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message:
          'Missing student identifier. Include Student Code, or include Student Name / Email Address.',
      });
      return;
    }

    const matchedStudent = matchStudent(row, studentIndexes);
    const matchedTeacher = identityMode === 'identifiable'
      ? matchTeacher(row.homeroom, teacherIndex)
      : { teacher: null, ambiguous: false };

    if (matchedStudent.warning) {
      rowWarnings.push(matchedStudent.warning);
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'warning',
        message: `${row.studentName}: ${matchedStudent.warning}`,
      });
    }

    if (identityMode === 'identifiable' && row.homeroom.trim() && matchedTeacher.ambiguous) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Homeroom "${row.homeroom}" matches more than one teacher.`,
      });
      return;
    }

    if (identityMode === 'identifiable' && row.homeroom.trim() && !matchedTeacher.teacher) {
      const warning = `Homeroom "${row.homeroom}" was not found. The student can still be imported, but will not be linked to a homeroom yet.`;

      rowWarnings.push(warning);
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'warning',
        message: warning,
      });
    }

    const invalidRating = Object.entries(row.ratings).find(([, value]) => !ratingToScore(value));

    if (invalidRating) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Unrecognized choice "${invalidRating[1]}". Use No thanks, Maybe, or Definitely.`,
      });
      return;
    }

    const ratings = Object.entries(row.ratings).map(([clubColumn, value]) => {
      const clubMatch = findSingleClub(clubColumn, clubIndex);
      const score = ratingToScore(value);
      if (!clubMatch.club || !score) {
        return null;
      }

      const isIneligiblePositiveRating =
        score.interestScore > 0 && !importClubAllowsGrade(clubMatch.club, grade);

      if (isIneligiblePositiveRating) {
        const warning = `${clubColumn} is not available to Grade ${grade}. Scheduler ignored this rating.`;
        rowWarnings.push(warning);
        issues.push({
          rowNumber: row.rowNumber,
          severity: 'warning',
          message: warning,
        });
      }

      return {
        clubId: clubMatch.club.id,
        clubTitle: clubMatch.club.section_label
          ? `${clubMatch.club.club_title} (${clubMatch.club.section_label})`
          : clubMatch.club.club_title,
        response: isIneligiblePositiveRating ? 'No thanks' : value,
        interestLevel: isIneligiblePositiveRating ? 'not_interested' : score.interestLevel,
        interestScore: isIneligiblePositiveRating ? 0 : score.interestScore,
      };
    });
    const validatedRatings = ratings.filter(Boolean) as ValidatedChoiceRow['ratings'];
    const resolvedMaxClubs = valueForGradeSpecificColumn({
      row,
      baseColumn: 'Max Clubs',
      grade,
    });

    const resolvedTopChoice = valueForGradeSpecificColumn({
      row,
      baseColumn: 'Top Choice',
      grade,
    });

    const topChoice = findSingleClub(resolvedTopChoice, clubIndex);

    if (resolvedTopChoice.trim() && topChoice.ambiguous) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Top choice "${resolvedTopChoice}" matches more than one club.`,
      });
      return;
    }

    if (resolvedTopChoice.trim() && !topChoice.club) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Top choice "${resolvedTopChoice}" does not match a current club.`,
      });
      return;
    }

    const topChoiceIsGradeEligible =
      !topChoice.club || importClubAllowsGrade(topChoice.club, grade);
    if (topChoice.club && !topChoiceIsGradeEligible) {
      const warning = `Top choice "${resolvedTopChoice}" is not available to Grade ${grade}. Scheduler ignored this top choice.`;
      rowWarnings.push(warning);
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'warning',
        message: warning,
      });
    }
    if (topChoice.club && topChoiceIsGradeEligible) {
      if (topChoice.matchedByTitleFallback) {
        const currentLabel = topChoice.club.section_label
          ? `${topChoice.club.club_title} (${topChoice.club.section_label})`
          : topChoice.club.club_title;
        const warning = `Older top-choice label "${resolvedTopChoice}" was matched to the unique current club "${currentLabel}".`;
        rowWarnings.push(warning);
        issues.push({
          rowNumber: row.rowNumber,
          severity: 'warning',
          message: warning,
        });
      }

      let topRating = validatedRatings.find(
        (rating) => rating.clubId === topChoice.club?.id
      );
      const originalTopScore = topRating?.interestScore ?? 0;
      if (!topRating) {
        topRating = {
          clubId: topChoice.club.id,
          clubTitle: topChoice.club.section_label
            ? `${topChoice.club.club_title} (${topChoice.club.section_label})`
            : topChoice.club.club_title,
          response: 'Definitely',
          interestLevel: 'really_want',
          interestScore: 2,
        };
        validatedRatings.push(topRating);
      } else if (topRating.interestScore < 2) {
        topRating.response = 'Definitely';
        topRating.interestLevel = 'really_want';
        topRating.interestScore = 2;
      }

      if (originalTopScore < 2) {
        const warning = `Top choice "${resolvedTopChoice}" was not rated as strong interest. Scheduler treated it as Definitely.`;
        rowWarnings.push(warning);
        issues.push({
          rowNumber: row.rowNumber,
          severity: 'warning',
          message: warning,
        });
      }
    }
    const maxClubs = parseMaxClubs(resolvedMaxClubs);
    const studentKey =
      matchedStudent.student?.id ??
      (identityMode === 'coded' ? `code:${studentCode}` : `new:${email || row.studentName}`);

    const displayName =
      identityMode === 'coded'
        ? codedStudentDisplayName(studentCode)
        : matchedStudent.student?.student_name ?? row.studentName.trim();

    validBeforeDuplicates.push({
      rowNumber: row.rowNumber,
      studentKey,
      studentId: matchedStudent.student?.id ?? null,
      matchType: matchedStudent.student ? 'existing' : 'new',
      identityMode,
      studentCode,
      studentName: displayName,
      email: identityMode === 'coded' ? codedStudentEmail(studentCode) : email,
      grade,
      homeroom: identityMode === 'coded' ? row.homeroomCode.trim() : row.homeroom.trim(),
      homeroomCode: row.homeroomCode.trim(),
      teacherId: matchedTeacher.teacher?.id ?? matchedStudent.student?.teacher_id ?? null,
      teacherName: matchedTeacher.teacher?.teacher_name ?? null,
      submittedAt: parseSubmittedAt(row.timestamp),
      participationPreference: participationPreferenceFromMaxClubs(maxClubs),
      maxClubs,
      topChoiceClubId: topChoiceIsGradeEligible ? topChoice.club?.id ?? null : null,
      topChoiceLabel: resolvedTopChoice,
      ratings: validatedRatings,
      warnings: rowWarnings,
    });
  });

  const latestByStudent = new Map<string, ValidatedChoiceRow>();
  const duplicateStudentKeys = new Set<string>();
  let replacedDuplicateRows = 0;

  validBeforeDuplicates.forEach((row) => {
    const existing = latestByStudent.get(row.studentKey);

    if (!existing) {
      latestByStudent.set(row.studentKey, row);
      return;
    }

    duplicateStudentKeys.add(row.studentKey);
    replacedDuplicateRows += 1;

    if (submissionSortValue(row.submittedAt) >= submissionSortValue(existing.submittedAt)) {
      latestByStudent.set(row.studentKey, row);
    }
  });

  duplicateStudentKeys.forEach((studentKey) => {
    const kept = latestByStudent.get(studentKey);

    if (kept) {
      issues.push({
        rowNumber: kept.rowNumber,
        severity: 'warning',
        message: `${kept.studentName} submitted more than once. The latest response will be imported.`,
      });
    }
  });

  const validRows = Array.from(latestByStudent.values()).sort((a, b) => a.rowNumber - b.rowNumber);
  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return {
    ok: !hasErrors && validRows.length > 0,
    yearLabel,
    blockLabel,
    totalRows: parsed.rows.length,
    validRows,
    issues,
    matchedStudentCount: validRows.filter((row) => row.matchType === 'existing').length,
    newStudentCount: validRows.filter((row) => row.matchType === 'new').length,
    matchedHomeroomCount: validRows.filter((row) => Boolean(row.teacherId || row.homeroomCode)).length,
    unmatchedHomeroomCount: validRows.filter((row) => !row.teacherId && !row.homeroomCode).length,
    duplicateStudentCount: duplicateStudentKeys.size,
    replacedDuplicateRows,
    detectedClubColumns: parsed.detectedClubColumns,
  };
}

async function resolveStudentForImport({
  admin,
  schoolYearId,
  row,
}: {
  admin: ReturnType<typeof createAdminClient>;
  schoolYearId: string | null;
  row: ValidatedChoiceRow;
}) {
  if (row.studentId) {
    return {
      studentId: row.studentId,
      created: false,
      error: null as string | null,
    };
  }

  if (row.identityMode === 'coded') {
    const { data: existingByCode, error: existingByCodeError } = await admin
      .from('students')
      .select('id')
      .eq('external_student_id', row.studentCode)
      .maybeSingle();

    if (existingByCodeError) {
      return {
        studentId: null,
        created: false,
        error: existingByCodeError.message,
      };
    }

    if (existingByCode?.id) {
      return {
        studentId: existingByCode.id as string,
        created: false,
        error: null,
      };
    }
  }

  if (row.identityMode === 'identifiable' && row.email) {
    const { data: existing, error: existingError } = await admin
      .from('students')
      .select('id')
      .eq('student_email', row.email)
      .maybeSingle();

    if (existingError) {
      return {
        studentId: null,
        created: false,
        error: existingError.message,
      };
    }

    if (existing?.id) {
      return {
        studentId: existing.id as string,
        created: false,
        error: null,
      };
    }
  }

  const insertPayload: Record<string, unknown> = {
    student_email: row.email,
    student_name: row.studentName,
    grade: row.grade,
    teacher_id: row.teacherId,
    teacher_homeroom_text: row.identityMode === 'coded' ? row.homeroomCode : row.homeroom || row.teacherName,
    external_student_id: row.studentCode || null,
    is_active: true,
  };

  if (schoolYearId) {
    insertPayload.school_year_id = schoolYearId;
  }

  const { data: created, error: createError } = await admin
    .from('students')
    .insert(insertPayload)
    .select('id')
    .single();

  if (createError || !created) {
    return {
      studentId: null,
      created: false,
      error: createError?.message ?? 'No student was created.',
    };
  }

  return {
    studentId: created.id as string,
    created: true,
    error: null,
  };
}

export async function commitImportChoices(csvText: string): Promise<ImportCommitResult> {
  const profile = await requireRole(['admin']);
  const preview = await previewImportChoices(csvText);

  if (!preview.ok) {
    return {
      ...preview,
      importedCount: 0,
      createdStudentCount: 0,
    };
  }

  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!block) {
    return {
      ...preview,
      ok: false,
      importedCount: 0,
      createdStudentCount: 0,
      issues: [
        ...preview.issues,
        {
          rowNumber: null,
          severity: 'error',
          message: 'No current session was found when trying to import.',
        },
      ],
    };
  }

  let importedCount = 0;
  let createdStudentCount = 0;
  const issues: ImportIssue[] = [...preview.issues];

  for (const row of preview.validRows) {
    const resolvedStudent = await resolveStudentForImport({
      admin,
      schoolYearId: year?.id ?? null,
      row,
    });

    if (!resolvedStudent.studentId) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Could not create or find ${row.studentName}: ${
          resolvedStudent.error ?? 'Unknown error'
        }`,
      });
      continue;
    }

    if (resolvedStudent.created) {
      createdStudentCount += 1;
    }

    const { error: updateError } = await admin
      .from('student_submissions')
      .update({ is_latest: false })
      .eq('block_id', block.id)
      .eq('student_id', resolvedStudent.studentId)
      .eq('is_latest', true);

    if (updateError) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Could not replace the prior response for ${row.studentName}: ${updateError.message}`,
      });
      continue;
    }

    const { data: submission, error: insertSubmissionError } = await admin
      .from('student_submissions')
      .insert({
        block_id: block.id,
        student_id: resolvedStudent.studentId,
        submitted_by_user_id: profile.id,
        participation_preference: row.participationPreference,
        max_clubs: row.maxClubs,
        top_choice_club_id: row.topChoiceClubId,
        submitted_at: row.submittedAt,
        is_latest: true,
      })
      .select('id')
      .single();

    if (insertSubmissionError || !submission) {
      issues.push({
        rowNumber: row.rowNumber,
        severity: 'error',
        message: `Could not import ${row.studentName}: ${
          insertSubmissionError?.message ?? 'No submission was created.'
        }`,
      });
      continue;
    }

    if (row.ratings.length > 0) {
      const { error: ratingsError } = await admin.from('student_interest_ratings').insert(
        row.ratings.map((rating) => ({
          student_submission_id: submission.id,
          club_offering_id: rating.clubId,
          interest_level: rating.interestLevel,
          interest_score: rating.interestScore,
        }))
      );

      if (ratingsError) {
        issues.push({
          rowNumber: row.rowNumber,
          severity: 'error',
          message: `Imported ${row.studentName}'s response but could not save club choices: ${ratingsError.message}`,
        });
        continue;
      }
    }

    importedCount += 1;
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error');

  return {
    ...preview,
    ok: !hasErrors,
    issues,
    importedCount,
    createdStudentCount,
  };
}