"use server";

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearSheetRange,
  getGoogleWorkspaceIdsForBlock,
  googleJsonFetch,
  rangeForSheet,
  refreshBlockWorkbookFromYearSetup,
  readSheetValues,
  writeSheetValues,
} from './google-workbook-utils';

type PushDraftAssignmentsResult = {
  ok: boolean;
  message: string;
  writtenCount?: number;
  skippedCount?: number;
  finalNamedRostersUpdated?: boolean;
  refreshedStudentMap?: boolean;
  studentMapRowCount?: number;
  homeroomRowCount?: number;
  noClubCount?: number;
  needsMoreClubsCount?: number;
  clubReviewCount?: number;
  workbookUrl?: string;
  alreadySent?: boolean;
};

type DraftAssignmentRow = {
  student_id: string;
  club_offering_id: string;
  was_top_choice: boolean | null;
  students:
    | {
        external_student_id: string | null;
        student_name: string | null;
      }
    | {
        external_student_id: string | null;
        student_name: string | null;
      }[]
    | null;
  club_offerings:
    | {
        club_title: string | null;
        section_label: string | null;
      }
    | {
        club_title: string | null;
        section_label: string | null;
      }[]
    | null;
};

type SubmissionRow = {
  id: string;
  student_id: string;
  max_clubs: number | null;
  top_choice_club_id: string | null;
};

type StudentRow = {
  id: string;
  external_student_id: string | null;
};

type ClubRow = {
  id: string;
  club_title: string | null;
  section_label: string | null;
  capacity_type: string | null;
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
  meeting_days: string[] | null;
  sponsor_name: string | null;
  grade_limited: boolean | null;
  eligible_grades: number[] | null;
  eligible_grade: number | null;
  matching_preference: string | null;
};

type InterestRatingRow = {
  student_submission_id: string;
  club_offering_id: string;
  interest_level: string | null;
  interest_score: number | null;
};

type SheetMetadata = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

const DRAFT_CODED_ASSIGNMENTS_TAB = 'Draft Coded Assignments';
const DRAFT_NAMED_ROSTERS_TAB = 'Draft Named Rosters';
const FINAL_NAMED_ROSTERS_TAB = 'Final Named Rosters';
const FINAL_CODED_ASSIGNMENTS_TAB = 'Final Coded Assignments';
const STUDENTS_WITH_NO_CLUB_TAB = 'Students with No Club';
const STUDENTS_NEEDING_MORE_CLUBS_TAB = 'Students Needing More Clubs';
const CLUB_SIZE_CHECK_TAB = 'Club Size Check';
const INSTRUCTIONS_TAB = 'Instructions';
const CLUB_REFERENCE_TAB = 'Club Reference';
const STUDENT_INTEREST_REFERENCE_TAB = 'Student Interest Reference';

const REVIEW_TABS = [
  STUDENTS_WITH_NO_CLUB_TAB,
  STUDENTS_NEEDING_MORE_CLUBS_TAB,
  CLUB_SIZE_CHECK_TAB,
  CLUB_REFERENCE_TAB,
  STUDENT_INTEREST_REFERENCE_TAB,
];

function googlePermissionMessage() {
  return [
    'Google is not connected with Sheets access yet.',
    'Click Connect Google, approve the requested permissions, then try again.',
  ].join(' ');
}

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function uniqueValues(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

async function findLatestMatchRun({
  admin,
  blockId,
}: {
  admin: ReturnType<typeof createAdminClient>;
  blockId: string;
}) {
  const timestampColumns = ['started_at', 'completed_at', 'updated_at', 'run_at', 'created_at'];

  for (const column of timestampColumns) {
    const query = admin.from('match_runs') as any;

    const { data, error } = await query
      .select(`id, ${column}`)
      .eq('block_id', blockId)
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) {
      return {
        id: data.id as string,
        error: null as string | null,
      };
    }
  }

  const { data, error } = await admin
    .from('match_runs')
    .select('id')
    .eq('block_id', blockId)
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      id: null,
      error: error.message,
    };
  }

  return {
    id: data?.id ? (data.id as string) : null,
    error: null,
  };
}

async function getSheetMetadata({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}) {
  return (await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    method: 'GET',
  })) as SheetMetadata;
}

async function ensureSheetsExist({
  accessToken,
  spreadsheetId,
  sheetTitles,
}: {
  accessToken: string;
  spreadsheetId: string;
  sheetTitles: string[];
}) {
  const metadata = await getSheetMetadata({ accessToken, spreadsheetId });
  const existingTitles = new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter(Boolean) as string[]
  );

  const missingTitles = sheetTitles.filter((title) => !existingTitles.has(title));

  if (missingTitles.length === 0) {
    return;
  }

  await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: 'POST',
    body: {
      requests: missingTitles.map((title) => ({
        addSheet: {
          properties: {
            title,
          },
        },
      })),
    },
  });
}

async function applyWorkbookUsabilityFormatting({
  accessToken,
  spreadsheetId,
  clubTitles,
  sectionLabels,
}: {
  accessToken: string;
  spreadsheetId: string;
  clubTitles: string[];
  sectionLabels: string[];
}) {
  const metadata = await getSheetMetadata({ accessToken, spreadsheetId });

  const sheetIdByTitle = new Map<string, number>();

  for (const sheet of metadata.sheets ?? []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;

    if (title && sheetId !== undefined) {
      sheetIdByTitle.set(title, sheetId);
    }
  }

  const requests: any[] = [];

  const filterWidths = new Map<string, number>([
    [DRAFT_NAMED_ROSTERS_TAB, 7],
    [FINAL_NAMED_ROSTERS_TAB, 7],
    [STUDENTS_WITH_NO_CLUB_TAB, 9],
    [STUDENTS_NEEDING_MORE_CLUBS_TAB, 10],
    [CLUB_SIZE_CHECK_TAB, 9],
  ]);

  for (const title of [
    DRAFT_NAMED_ROSTERS_TAB,
    FINAL_NAMED_ROSTERS_TAB,
    STUDENTS_WITH_NO_CLUB_TAB,
    STUDENTS_NEEDING_MORE_CLUBS_TAB,
    CLUB_SIZE_CHECK_TAB,
    FINAL_CODED_ASSIGNMENTS_TAB,
  ]) {
    const sheetId = sheetIdByTitle.get(title);

    if (sheetId === undefined) continue;

    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    const filterWidth = filterWidths.get(title);

    if (filterWidth) {
      requests.push({ clearBasicFilter: { sheetId } });
      requests.push({
        setBasicFilter: {
          filter: {
            range: {
              sheetId,
              startRowIndex: 0,
              startColumnIndex: 0,
              endColumnIndex: filterWidth,
            },
          },
        },
      });
    }

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true,
            },
            backgroundColor: {
              red: 0.93,
              green: 0.96,
              blue: 1,
            },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    });
  }

  for (const title of [
    FINAL_CODED_ASSIGNMENTS_TAB,
    CLUB_REFERENCE_TAB,
    STUDENT_INTEREST_REFERENCE_TAB,
  ]) {
    const sheetId = sheetIdByTitle.get(title);
    if (sheetId === undefined) continue;

    requests.push({
      updateSheetProperties: {
        properties: { sheetId, hidden: true },
        fields: 'hidden',
      },
    });
  }

  const finalNamedSheetId = sheetIdByTitle.get(FINAL_NAMED_ROSTERS_TAB);

  if (finalNamedSheetId !== undefined && clubTitles.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: finalNamedSheetId,
          startRowIndex: 1,
          endRowIndex: 1000,
          startColumnIndex: 0,
          endColumnIndex: 1,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: clubTitles.map((title) => ({ userEnteredValue: title })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
  }

  if (finalNamedSheetId !== undefined && sectionLabels.length > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId: finalNamedSheetId,
          startRowIndex: 1,
          endRowIndex: 1000,
          startColumnIndex: 1,
          endColumnIndex: 2,
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: sectionLabels.map((label) => ({ userEnteredValue: label })),
          },
          strict: false,
          showCustomUi: true,
        },
      },
    });
  }

  if (requests.length === 0) {
    return;
  }

  await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: 'POST',
    body: {
      requests,
    },
  });
}

function draftNamedRosterRow({
  clubTitle,
  sectionLabel,
  studentCode,
  wasTopChoice,
  rowNumber,
}: {
  clubTitle: string;
  sectionLabel: string;
  studentCode: string;
  wasTopChoice: string;
  rowNumber: number;
}) {
  return [
    clubTitle,
    sectionLabel,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,2,FALSE),"")`,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,4,FALSE),"")`,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,6,FALSE),"")`,
    studentCode,
    wasTopChoice,
  ];
}

function finalNamedRosterRow({
  clubTitle,
  sectionLabel,
  studentCode,
  rowNumber,
}: {
  clubTitle: string;
  sectionLabel: string;
  studentCode: string;
  rowNumber: number;
}) {
  return [
    clubTitle,
    sectionLabel,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,2,FALSE),"")`,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,4,FALSE),"")`,
    `=IFERROR(VLOOKUP($F${rowNumber},'Student Map'!$A:$I,6,FALSE),"")`,
    studentCode,
    '',
  ];
}

function namedStudentFormula(studentCodeColumn: string, rowNumber: number) {
  return `=IFERROR(VLOOKUP($${studentCodeColumn}${rowNumber},'Student Map'!$A:$I,2,FALSE),"")`;
}

function gradeFormula(studentCodeColumn: string, rowNumber: number) {
  return `=IFERROR(VLOOKUP($${studentCodeColumn}${rowNumber},'Student Map'!$A:$I,4,FALSE),"")`;
}

function homeroomFormula(studentCodeColumn: string, rowNumber: number) {
  return `=IFERROR(VLOOKUP($${studentCodeColumn}${rowNumber},'Student Map'!$A:$I,6,FALSE),"")`;
}


function normalizedRows(values: string[][] | undefined) {
  return (values ?? []).map((row) => row.map((cell) => String(cell ?? '').trim()));
}
async function inspectDraftDelivery({ accessToken, spreadsheetId, matchRunId, expectedRows }: { accessToken:string; spreadsheetId:string; matchRunId:string; expectedRows:string[][] }) {
  const response = await readSheetValues({ accessToken, spreadsheetId, range: rangeForSheet(DRAFT_CODED_ASSIGNMENTS_TAB, 'A:F') });
  const values = normalizedRows(response.values);
  const rows = values.slice(1).filter((row) => row.some(Boolean));
  const expectedKeys = new Set(expectedRows.map((row) => [row[0],row[1],row[2],row[3],row[5]].map((cell) => String(cell ?? '').trim()).join('|')));
  const actualKeys = new Set(rows.map((row) => [row[0],row[1],row[2],row[3],row[5]].map((cell) => String(cell ?? '').trim()).join('|')));
  const verified = rows.length === expectedRows.length && rows.every((row) => String(row[5] ?? '').trim() === matchRunId) && actualKeys.size === expectedKeys.size && [...expectedKeys].every((key) => actualKeys.has(key));
  return { verified, rowCount: rows.length, hasRows: rows.length > 0 };
}

async function finalNamedRostersHasRows({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}) {
  const response = await readSheetValues({
    accessToken,
    spreadsheetId,
    range: rangeForSheet(FINAL_NAMED_ROSTERS_TAB, 'A2:A'),
  });

  return Boolean(
    response.values?.some((row) => row.some((cell) => String(cell ?? '').trim()))
  );
}

export async function pushDraftAssignmentsToGoogle(): Promise<PushDraftAssignmentsResult> {
  await requireRole(['admin']);

  const supabase = await createClient();
  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return {
      ok: false,
      message: 'No active school year or current session is configured.',
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      ok: false,
      message: `Could not check your Google connection: ${sessionError.message}`,
    };
  }

  const providerToken = session?.provider_token;

  if (!providerToken) {
    return {
      ok: false,
      message: googlePermissionMessage(),
    };
  }

  const workspaceIds = await getGoogleWorkspaceIdsForBlock({
    schoolYearId: year.id,
    blockId: block.id,
  });

  if (!workspaceIds.ok || !workspaceIds.ids) {
    return {
      ok: false,
      message: workspaceIds.message ?? 'Could not find the Google workbooks for this session.',
    };
  }

  const latestRun = await findLatestMatchRun({
    admin,
    blockId: block.id,
  });

  if (latestRun.error) {
    return {
      ok: false,
      message: `Could not find the latest match run: ${latestRun.error}`,
    };
  }

  if (!latestRun.id) {
    return {
      ok: false,
      message: 'No match run was found for this session. Run matching first.',
    };
  }

  const latestRunId = latestRun.id;

  const {
    data: belowMinimumRows = [],
    error: belowMinimumError,
  } = await admin
    .from('match_demand_summaries')
    .select('club_offering_id')
    .eq('match_run_id', latestRunId)
    .eq('below_minimum', true);

  if (belowMinimumError) {
    return {
      ok: false,
      message:
        `Could not check small-club decisions: ${belowMinimumError.message}`,
    };
  }

  const {
    data: blockDecisions = [],
    error: blockDecisionsError,
  } = await admin
    .from('below_minimum_decisions')
    .select('club_offering_id, decision')
    .eq('block_id', block.id);

  if (blockDecisionsError) {
    return {
      ok: false,
      message:
        `Could not check club decisions: ${blockDecisionsError.message}`,
    };
  }

  const decidedClubIdsForExport = new Set(
    (blockDecisions ?? []).map((row) => row.club_offering_id)
  );

  const unresolvedClubCount = (belowMinimumRows ?? []).filter(
    (row) => !decidedClubIdsForExport.has(row.club_offering_id)
  ).length;

  if (unresolvedClubCount > 0) {
    return {
      ok: false,
      message:
        `Resolve ${unresolvedClubCount} small-club decision${unresolvedClubCount === 1 ? '' : 's'} before sending draft rosters to Google.`,
    };
  }

  const cancelledClubIdsForExport = new Set(
    (blockDecisions ?? [])
      .filter((row) => row.decision === 'cancel')
      .map((row) => row.club_offering_id)
  );

  if (cancelledClubIdsForExport.size > 0) {
    const {
      count: cancelledAssignmentCount,
      error: cancelledAssignmentError,
    } = await admin
      .from('draft_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('match_run_id', latestRunId)
      .in(
        'club_offering_id',
        Array.from(cancelledClubIdsForExport)
      );

    if (cancelledAssignmentError) {
      return {
        ok: false,
        message:
          `Could not check cancelled-club assignments: ${cancelledAssignmentError.message}`,
      };
    }

    if ((cancelledAssignmentCount ?? 0) > 0) {
      return {
        ok: false,
        message:
          `A cancelled club still has ${cancelledAssignmentCount} draft assignment${cancelledAssignmentCount === 1 ? '' : 's'}. Run Rematch after cancellations before sending rosters to Google.`,
      };
    }
  }


  const [
    { data: assignments, error: assignmentsError },
    { data: submissions, error: submissionsError },
    { data: students, error: studentsError },
    { data: clubs, error: clubsError },
  ] = await Promise.all([
    admin
      .from('draft_assignments')
      .select(
        `
        student_id,
        club_offering_id,
        was_top_choice,
        students (
          external_student_id,
          student_name
        ),
        club_offerings (
          club_title,
          section_label
        )
      `
      )
      .eq('match_run_id', latestRunId),

    admin
      .from('student_submissions')
      .select('id, student_id, max_clubs, top_choice_club_id')
      .eq('block_id', block.id)
      .eq('is_latest', true),

    admin.from('students').select('id, external_student_id'),

    admin
      .from('club_offerings')
      .select(
        'id, club_title, section_label, capacity_type, max_capacity, minimum_viable_enrollment, is_active, show_to_students, meeting_days, sponsor_name, grade_limited, eligible_grades, eligible_grade, matching_preference'
      )
      .eq('block_id', block.id)
      .eq('is_active', true),
  ]);

  if (assignmentsError) {
    return {
      ok: false,
      message: `Could not load draft assignments: ${assignmentsError.message}`,
    };
  }

  if (submissionsError) {
    return {
      ok: false,
      message: `Could not load student choice summaries: ${submissionsError.message}`,
    };
  }

  if (studentsError) {
    return {
      ok: false,
      message: `Could not load student codes: ${studentsError.message}`,
    };
  }

  if (clubsError) {
    return {
      ok: false,
      message: `Could not load club summaries: ${clubsError.message}`,
    };
  }

  const submissionIds = (submissions ?? [])
    .map((submission: any) => submission.id)
    .filter(Boolean);

  let interestRatings: InterestRatingRow[] = [];

  if (submissionIds.length > 0) {
    const { data: ratingRows = [], error: ratingsError } = await admin
      .from('student_interest_ratings')
      .select('student_submission_id, club_offering_id, interest_level, interest_score')
      .in('student_submission_id', submissionIds);

    if (ratingsError) {
      return {
        ok: false,
        message: `Could not load student interest details: ${ratingsError.message}`,
      };
    }

    interestRatings = (ratingRows ?? []) as InterestRatingRow[];
  }

  const assignmentRows = (assignments ?? []) as DraftAssignmentRow[];
  const submissionRows = (submissions ?? []) as SubmissionRow[];
  const studentRows = (students ?? []) as StudentRow[];
  const clubRows = (clubs ?? []) as ClubRow[];

  if (assignmentRows.length === 0) {
    return {
      ok: false,
      message: 'No draft assignments were found for the latest match run.',
    };
  }

  const studentCodeById = new Map<string, string>();

  for (const student of studentRows) {
    const code = String(student.external_student_id ?? '').trim();

    if (code) {
      studentCodeById.set(student.id, code);
    }
  }

  const clubById = new Map<string, ClubRow>();

  for (const club of clubRows) {
    clubById.set(club.id, club);
  }

  const clubCountById = new Map<string, number>();
  const assignedCountByStudentId = new Map<string, number>();
  const assignedClubIdsByStudentId = new Map<string, Set<string>>();
  const assignmentOrderByStudent = new Map<string, number>();
  let skippedCount = 0;

  const draftCodedRows = assignmentRows.flatMap((assignment) => {
    const student = firstRelation(assignment.students);
    const club = firstRelation(assignment.club_offerings);
    const studentCode = String(student?.external_student_id ?? '').trim();

    if (!studentCode) {
      skippedCount += 1;
      return [];
    }

    const nextOrder = (assignmentOrderByStudent.get(studentCode) ?? 0) + 1;
    assignmentOrderByStudent.set(studentCode, nextOrder);

    assignedCountByStudentId.set(
      assignment.student_id,
      (assignedCountByStudentId.get(assignment.student_id) ?? 0) + 1
    );

    const existingClubIds = assignedClubIdsByStudentId.get(assignment.student_id) ?? new Set<string>();
    existingClubIds.add(assignment.club_offering_id);
    assignedClubIdsByStudentId.set(assignment.student_id, existingClubIds);

    clubCountById.set(
      assignment.club_offering_id,
      (clubCountById.get(assignment.club_offering_id) ?? 0) + 1
    );

    return [
      [
        studentCode,
        club?.club_title ?? '',
        club?.section_label ?? '',
        String(nextOrder),
        assignment.was_top_choice ? 'TRUE' : 'FALSE',
        latestRunId,
      ],
    ];
  });

  const draftNamedRows = draftCodedRows.map((row, index) => {
    const spreadsheetRowNumber = index + 2;

    return draftNamedRosterRow({
      studentCode: String(row[0] ?? ''),
      clubTitle: String(row[1] ?? ''),
      sectionLabel: String(row[2] ?? ''),
      wasTopChoice: String(row[4] ?? ''),
      rowNumber: spreadsheetRowNumber,
    });
  });

  const finalNamedRows = draftCodedRows.map((row, index) => {
    const spreadsheetRowNumber = index + 2;

    return finalNamedRosterRow({
      studentCode: String(row[0] ?? ''),
      clubTitle: String(row[1] ?? ''),
      sectionLabel: String(row[2] ?? ''),
      rowNumber: spreadsheetRowNumber,
    });
  });

  const studentsWithNoClubRows: unknown[][] = [];
  const studentsNeedingMoreClubRows: unknown[][] = [];

  for (const submission of submissionRows) {
    const requested = Number(submission.max_clubs ?? 0);
    const assigned = assignedCountByStudentId.get(submission.student_id) ?? 0;
    const studentCode = studentCodeById.get(submission.student_id) ?? '';

    if (!studentCode) continue;

    const assignedClubIds = assignedClubIdsByStudentId.get(submission.student_id) ?? new Set<string>();
    const gotTopChoice = Boolean(
      submission.top_choice_club_id && assignedClubIds.has(submission.top_choice_club_id)
    );

    const topChoiceClub = submission.top_choice_club_id
      ? clubById.get(submission.top_choice_club_id)
      : null;

    const topChoiceText = topChoiceClub
      ? [topChoiceClub.club_title ?? '', topChoiceClub.section_label ?? ''].filter(Boolean).join(' / ')
      : '';

    if (requested > 0 && assigned === 0) {
      const rowNumber = studentsWithNoClubRows.length + 2;
      studentsWithNoClubRows.push([
        namedStudentFormula('A', rowNumber),
        gradeFormula('A', rowNumber),
        homeroomFormula('A', rowNumber),
        studentCode,
        requested,
        assigned,
        topChoiceText,
        gotTopChoice ? 'TRUE' : 'FALSE',
        '',
      ]);
    }

    if (requested > assigned) {
      const rowNumber = studentsNeedingMoreClubRows.length + 2;
      studentsNeedingMoreClubRows.push([
        namedStudentFormula('A', rowNumber),
        gradeFormula('A', rowNumber),
        homeroomFormula('A', rowNumber),
        studentCode,
        requested,
        assigned,
        Math.max(0, requested - assigned),
        topChoiceText,
        gotTopChoice ? 'TRUE' : 'FALSE',
        '',
      ]);
    }
  }

  const clubSizeRows = clubRows.map((club) => {
    const draftCount = clubCountById.get(club.id) ?? 0;
    const minimum = Number(club.minimum_viable_enrollment ?? 0);
    const capacity = club.capacity_type === 'unlimited' ? null : club.max_capacity;
    const overCapacityBy = capacity === null || capacity === undefined ? 0 : Math.max(0, draftCount - Number(capacity));
    const belowMinimumBy = minimum > 0 ? Math.max(0, minimum - draftCount) : 0;

    return [
      club.club_title ?? '',
      club.section_label ?? '',
      capacity === null || capacity === undefined ? 'Unlimited' : capacity,
      minimum,
      draftCount,
      overCapacityBy,
      belowMinimumBy,
      belowMinimumBy > 0 ? 'Review' : overCapacityBy > 0 ? 'Over capacity' : 'OK',
      '',
    ];
  });

  const clubReferenceHeaders = [
    'club_id',
    'club_title',
    'section_label',
    'meeting_days',
    'sponsor_name',
    'capacity_type',
    'max_capacity',
    'minimum_viable_enrollment',
    'grade_limited',
    'eligible_grades',
    'matching_preference',
    'is_active',
  ];

  const clubReferenceRows = clubRows.map((club) => [
    club.id,
    club.club_title ?? '',
    club.section_label ?? '',
    Array.isArray(club.meeting_days) ? club.meeting_days.join(', ') : '',
    club.sponsor_name ?? '',
    club.capacity_type ?? '',
    club.max_capacity ?? '',
    club.minimum_viable_enrollment ?? '',
    club.grade_limited ? 'TRUE' : 'FALSE',
    Array.isArray(club.eligible_grades) && club.eligible_grades.length > 0
      ? club.eligible_grades.join(', ')
      : club.eligible_grade ?? '',
    club.matching_preference ?? '',
    club.is_active ? 'TRUE' : 'FALSE',
  ]);

  const submissionById = new Map(
    submissionRows.map((submission) => [submission.id, submission])
  );

  const studentInterestReferenceHeaders = [
    'student_code',
    'club_id',
    'club_title',
    'section_label',
    'interest_level',
    'interest_score',
    'is_top_choice',
    'max_clubs',
  ];

  const studentInterestReferenceRows = interestRatings.flatMap((rating) => {
    const submission = submissionById.get(rating.student_submission_id);
    const club = clubById.get(rating.club_offering_id);
    const studentCode = submission
      ? studentCodeById.get(submission.student_id) ?? ''
      : '';

    if (!submission || !club || !studentCode) return [];

    return [[
      studentCode,
      club.id,
      club.club_title ?? '',
      club.section_label ?? '',
      rating.interest_level ?? '',
      Number(rating.interest_score ?? 0),
      submission.top_choice_club_id === club.id ? 'TRUE' : 'FALSE',
      Number(submission.max_clubs ?? 0),
    ]];
  });

  const draftCodedHeaders = [
    'student_code',
    'club_title',
    'section_label',
    'assignment_order',
    'was_top_choice',
    'match_run_id',
  ];

  const namedDraftHeaders = [
    'club_title',
    'section_label',
    'student_name',
    'grade',
    'homeroom_name',
    'student_code',
    'was_top_choice',
  ];

  const finalNamedHeaders = [
    'club_title',
    'section_label',
    'student_name',
    'grade',
    'homeroom_name',
    'student_code',
    'notes',
  ];

  const finalCodedHeaders = [
    'student_code',
    'club_title',
    'section_label',
    'assignment_order',
  ];

  const noClubHeaders = [
    'student_name',
    'grade',
    'homeroom_name',
    'student_code',
    'requested_clubs',
    'assigned_clubs',
    'top_choice',
    'top_choice_received',
    'notes',
  ];

  const needingMoreHeaders = [
    'student_name',
    'grade',
    'homeroom_name',
    'student_code',
    'requested_clubs',
    'assigned_clubs',
    'short_by',
    'top_choice',
    'top_choice_received',
    'notes',
  ];

  const clubSizeHeaders = [
    'club_title',
    'section_label',
    'capacity',
    'minimum_students',
    'draft_count',
    'over_capacity_by',
    'below_minimum_by',
    'status',
    'notes',
  ];

  const finalCodedFormula =
    `=IFERROR(FILTER({'Final Named Rosters'!F2:F,'Final Named Rosters'!A2:A,'Final Named Rosters'!B2:B,IF(LEN('Final Named Rosters'!F2:F),ROW('Final Named Rosters'!F2:F)-1,)},LEN('Final Named Rosters'!F2:F)),"")`;

  const instructionValues = [
    ['School Club Scheduler session workbook', ''],
    ['Start here', 'Review the tabs below after Scheduler sends draft rosters to Google.'],
    ['Final Named Rosters', 'Edit this tab when you need to adjust rosters. Keep student_code values with the correct student.'],
    ['Students with No Club', 'Students listed here did not receive a club in the draft match. Use this as a review list.'],
    ['Students Needing More Clubs', 'Students listed here received fewer clubs than requested. Use this as a review list.'],
    ['Club Size Check', 'Shows clubs that may be too small or over capacity. These are warnings, not automatic blockers.'],
    ['Important', 'Do not edit student_code values. They are how Scheduler safely syncs draft rosters back without names.'],
    ['Important', 'After edits are finished, return to Scheduler Workflow and click Pull reviewed rosters from Google.'],
  ];

  try {
    const refreshResult = await refreshBlockWorkbookFromYearSetup({
      accessToken: providerToken,
      yearWorkbookId: workspaceIds.ids.yearWorkbookId,
      blockWorkbookId: workspaceIds.ids.blockWorkbookId,
    });

    await ensureSheetsExist({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      sheetTitles: [INSTRUCTIONS_TAB, ...REVIEW_TABS],
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(INSTRUCTIONS_TAB, 'A:B'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(INSTRUCTIONS_TAB, 'A1'),
      values: instructionValues,
      valueInputOption: 'RAW',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(DRAFT_CODED_ASSIGNMENTS_TAB, 'A:F'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(DRAFT_CODED_ASSIGNMENTS_TAB, 'A1'),
      values: [draftCodedHeaders, ...draftCodedRows],
      valueInputOption: 'RAW',
    });


    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(DRAFT_NAMED_ROSTERS_TAB, 'A:G'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(DRAFT_NAMED_ROSTERS_TAB, 'A1'),
      values: [namedDraftHeaders, ...draftNamedRows],
      valueInputOption: 'USER_ENTERED',
    });

    const finalAlreadyHasRows = await finalNamedRostersHasRows({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
    });

    if (!finalAlreadyHasRows) {
      await clearSheetRange({
        accessToken: providerToken,
        spreadsheetId: workspaceIds.ids.blockWorkbookId,
        range: rangeForSheet(FINAL_NAMED_ROSTERS_TAB, 'A:G'),
      });

      await writeSheetValues({
        accessToken: providerToken,
        spreadsheetId: workspaceIds.ids.blockWorkbookId,
        range: rangeForSheet(FINAL_NAMED_ROSTERS_TAB, 'A1'),
        values: [finalNamedHeaders, ...finalNamedRows],
        valueInputOption: 'USER_ENTERED',
      });
    }

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(FINAL_CODED_ASSIGNMENTS_TAB, 'A:D'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(FINAL_CODED_ASSIGNMENTS_TAB, 'A1'),
      values: [finalCodedHeaders, [finalCodedFormula]],
      valueInputOption: 'USER_ENTERED',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENTS_WITH_NO_CLUB_TAB, 'A:I'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENTS_WITH_NO_CLUB_TAB, 'A1'),
      values: [noClubHeaders, ...studentsWithNoClubRows],
      valueInputOption: 'USER_ENTERED',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENTS_NEEDING_MORE_CLUBS_TAB, 'A:J'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENTS_NEEDING_MORE_CLUBS_TAB, 'A1'),
      values: [needingMoreHeaders, ...studentsNeedingMoreClubRows],
      valueInputOption: 'USER_ENTERED',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(CLUB_SIZE_CHECK_TAB, 'A:I'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(CLUB_SIZE_CHECK_TAB, 'A1'),
      values: [clubSizeHeaders, ...clubSizeRows],
      valueInputOption: 'RAW',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(CLUB_REFERENCE_TAB, 'A:L'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(CLUB_REFERENCE_TAB, 'A1'),
      values: [clubReferenceHeaders, ...clubReferenceRows],
      valueInputOption: 'RAW',
    });

    await clearSheetRange({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENT_INTEREST_REFERENCE_TAB, 'A:H'),
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(STUDENT_INTEREST_REFERENCE_TAB, 'A1'),
      values: [studentInterestReferenceHeaders, ...studentInterestReferenceRows],
      valueInputOption: 'RAW',
    });

    await applyWorkbookUsabilityFormatting({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      clubTitles: uniqueValues(clubRows.map((club) => club.club_title ?? '')),
      sectionLabels: uniqueValues(clubRows.map((club) => club.section_label ?? '')),
    });
    const deliveryReceipt = await inspectDraftDelivery({ accessToken: providerToken, spreadsheetId: workspaceIds.ids.blockWorkbookId, matchRunId: latestRunId, expectedRows: draftCodedRows.map((row) => row.map((cell) => String(cell ?? ''))) });
    const [namedReceipt, clubReceipt, interestReceipt] = await Promise.all([
      readSheetValues({ accessToken: providerToken, spreadsheetId: workspaceIds.ids.blockWorkbookId, range: rangeForSheet(DRAFT_NAMED_ROSTERS_TAB, 'A:G') }),
      readSheetValues({ accessToken: providerToken, spreadsheetId: workspaceIds.ids.blockWorkbookId, range: rangeForSheet(CLUB_REFERENCE_TAB, 'A:L') }),
      readSheetValues({ accessToken: providerToken, spreadsheetId: workspaceIds.ids.blockWorkbookId, range: rangeForSheet(STUDENT_INTEREST_REFERENCE_TAB, 'A:H') }),
    ]);
    const namedCount = normalizedRows(namedReceipt.values).slice(1).filter((row) => row.some(Boolean)).length;
    const clubCount = normalizedRows(clubReceipt.values).slice(1).filter((row) => row.some(Boolean)).length;
    const interestCount = normalizedRows(interestReceipt.values).slice(1).filter((row) => row.some(Boolean)).length;
    if (!deliveryReceipt.verified || namedCount !== draftNamedRows.length || clubCount !== clubReferenceRows.length || interestCount !== studentInterestReferenceRows.length) {
      throw new Error('Google did not confirm the complete roster-review package. Scheduler did not advance the workflow. Try sending the draft rosters again.');
    }

    const workflowUpdate = await admin
      .from('blocks')
      .update({ status: 'review' })
      .eq('id', block.id);

    if (workflowUpdate.error) {
      return {
        ok: false,
        message:
          `Draft rosters were sent, but Workflow could not advance: ${workflowUpdate.error.message}`,
      };
    }

    return {
      ok: true,
      message: finalAlreadyHasRows
        ? `Sent ${draftCodedRows.length} draft assignments to Google. Final Named Rosters already had rows, so coordinator edits were preserved. Review tabs were updated.`
        : `Sent ${draftCodedRows.length} draft assignments to Google and prepared editable draft rosters and review tabs.`,
      writtenCount: draftCodedRows.length,
      skippedCount,
      finalNamedRostersUpdated: !finalAlreadyHasRows,
      refreshedStudentMap: true,
      studentMapRowCount: refreshResult.studentMapRowCount,
      homeroomRowCount: refreshResult.homeroomRowCount,
      noClubCount: studentsWithNoClubRows.length,
      needsMoreClubsCount: studentsNeedingMoreClubRows.length,
      clubReviewCount: clubSizeRows.length,
      workbookUrl: `https://docs.google.com/spreadsheets/d/${workspaceIds.ids.blockWorkbookId}/edit`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not send draft assignments to Google.';

    if (
      message.toLowerCase().includes('permission') ||
      message.toLowerCase().includes('scope') ||
      message.toLowerCase().includes('access') ||
      message.toLowerCase().includes('unauthorized')
    ) {
      return {
        ok: false,
        message: `${message} Try Connect Google again. If this keeps happening, the district Google admin may need to approve this app for Sheets access.`,
      };
    }

    return {
      ok: false,
      message,
    };
  }
}

