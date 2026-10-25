
'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { validateClubOffering } from '@/lib/validations';
import {
  TEST_FIXTURE_MARKER,
  TEST_HOMEROOM_CODE_PREFIX,
  TEST_STUDENT_CODE_PREFIX,
  codedChoicesSheetValues,
  homeroomSheetValues,
  studentMapSheetValues,
  testClubs,
  testHomerooms,
} from '@/lib/test-data/scheduler-test-fixture';
import {
  clearSheetRange,
  googleJsonFetch,
  rangeForSheet,
  readSheetValues,
  writeSheetValues,
} from '../google-workspace/google-workbook-utils';

export type TestDataResult = {
  ok: boolean;
  message: string;
  homeroomCount?: number;
  clubCount?: number;
  studentCount?: number;
  choiceCount?: number;
  simulatedChoiceCount?: number;
  googleUpdated?: boolean;
  googleWorkspaceReset?: boolean;
};

type ExistingClubRow = {
  id: string;
  club_title: string | null;
  section_label: string | null;
  admin_notes: string | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
};

function assertTestDataEnabled() {
  if (process.env.NODE_ENV !== 'production') return;
  if (process.env.ENABLE_TEST_DATA_SEED === 'true') return;

  throw new Error('Test data seeding is disabled in production unless ENABLE_TEST_DATA_SEED=true.');
}

function revalidateTestDataPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/test-data');
  revalidatePath('/admin/teachers');
  revalidatePath('/admin/clubs');
  revalidatePath('/admin/workflow');
  revalidatePath('/admin/google-workspace');
  revalidatePath('/admin/year-google-workspace');
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function clubKey({
  clubTitle,
  sectionLabel,
}: {
  clubTitle: string | null | undefined;
  sectionLabel: string | null | undefined;
}) {
  return `${normalizeKey(clubTitle)}|${normalizeKey(sectionLabel)}`;
}

function uniqueTestClubTitles() {
  return Array.from(new Set(testClubs.map((club) => club.club_title)));
}

async function getProviderToken() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.provider_token ?? null;
}

async function getWorkspaceIds({
  schoolYearId,
  blockId,
}: {
  schoolYearId: string;
  blockId: string;
}) {
  const admin = createAdminClient();

  const [{ data: yearWorkspace }, { data: blockWorkspace }] = await Promise.all([
    admin
      .from('google_year_workspace_links')
      .select('google_year_setup_workbook_id')
      .eq('school_year_id', schoolYearId)
      .maybeSingle(),
    admin
      .from('google_workspace_links')
      .select('google_setup_workbook_id')
      .eq('school_year_id', schoolYearId)
      .eq('block_id', blockId)
      .maybeSingle(),
  ]);

  return {
    yearWorkbookId: yearWorkspace?.google_year_setup_workbook_id ?? null,
    blockWorkbookId: blockWorkspace?.google_setup_workbook_id ?? null,
  };
}

async function upsertHomerooms() {
  const admin = createAdminClient();

  for (const homeroom of testHomerooms) {
    const { data: existing, error: existingError } = await admin
      .from('teachers')
      .select('id')
      .eq('homeroom_code', homeroom.homeroom_code)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Could not check homeroom ${homeroom.homeroom_name}: ${existingError.message}`);
    }

    if (existing?.id) {
      const { error } = await admin
        .from('teachers')
        .update({
          teacher_name: homeroom.homeroom_name,
          is_active: true,
          sort_order: 0,
        })
        .eq('id', existing.id);

      if (error) {
        throw new Error(`Could not update homeroom ${homeroom.homeroom_name}: ${error.message}`);
      }
    } else {
      const { error } = await admin.from('teachers').insert({
        teacher_name: homeroom.homeroom_name,
        homeroom_code: homeroom.homeroom_code,
        is_active: true,
        sort_order: 0,
      });

      if (error) {
        throw new Error(`Could not add homeroom ${homeroom.homeroom_name}: ${error.message}`);
      }
    }
  }
}

async function getExistingFixtureNamedClubs(blockId: string) {
  const admin = createAdminClient();
  const titles = uniqueTestClubTitles();

  const { data, error } = await admin
    .from('club_offerings')
    .select('id, club_title, section_label, admin_notes, is_active, show_to_students')
    .eq('block_id', blockId)
    .in('club_title', titles);

  if (error) {
    throw new Error(`Could not check existing fixture clubs: ${error.message}`);
  }

  return (data ?? []) as ExistingClubRow[];
}

async function upsertClubs({ blockId, userId }: { blockId: string; userId: string }) {
  const admin = createAdminClient();
  const existingClubs = await getExistingFixtureNamedClubs(blockId);
  const existingByKey = new Map<string, ExistingClubRow[]>();

  for (const club of existingClubs) {
    const key = clubKey({ clubTitle: club.club_title, sectionLabel: club.section_label });
    const existing = existingByKey.get(key) ?? [];
    existing.push(club);
    existingByKey.set(key, existing);
  }

  const canonicalIds: string[] = [];

  for (const club of testClubs) {
    const key = clubKey({ clubTitle: club.club_title, sectionLabel: club.section_label });
    const matches = existingByKey.get(key) ?? [];
    const canonical =
      matches.find((match) => match.admin_notes === TEST_FIXTURE_MARKER) ?? matches[0] ?? null;

    const payload = {
      block_id: blockId,
      submitted_by_user_id: userId,
      club_title: club.club_title,
      section_label: club.section_label,
      description: club.description,
      sponsor_name: club.sponsor_name,
      leader_email: club.leader_email,
      meeting_days: club.meeting_days,
      capacity_type: club.capacity_type,
      max_capacity: club.max_capacity,
      minimum_viable_enrollment: club.minimum_viable_enrollment,
      minimum_applies_to: club.minimum_applies_to,
      grade_limited: club.grade_limited,
      eligible_grades: club.eligible_grades,
      eligible_grade: club.eligible_grades?.length === 1 ? club.eligible_grades[0] : null,
      matching_preference: club.matching_preference,
      admin_notes: TEST_FIXTURE_MARKER,
      is_active: true,
      show_to_students: true,
    };

    let clubId = canonical?.id ?? '';

    if (clubId) {
      const { error } = await admin.from('club_offerings').update(payload).eq('id', clubId);

      if (error) {
        throw new Error(`Could not update test club ${club.club_title}: ${error.message}`);
      }
    } else {
      const { data, error } = await admin
        .from('club_offerings')
        .insert(payload)
        .select('id')
        .single();

      if (error || !data?.id) {
        throw new Error(`Could not add test club ${club.club_title}: ${error?.message ?? 'Unknown error'}`);
      }

      clubId = data.id;
    }

    canonicalIds.push(clubId);
  }

  const canonicalIdSet = new Set(canonicalIds);
  const duplicateIds = existingClubs
    .map((club) => club.id)
    .filter((id) => !canonicalIdSet.has(id));

  if (duplicateIds.length > 0) {
    const { error } = await admin
      .from('club_offerings')
      .update({
        is_active: false,
        show_to_students: false,
        admin_notes: `${TEST_FIXTURE_MARKER} duplicate hidden by test seeder`,
      })
      .in('id', duplicateIds);

    if (error) {
      throw new Error(`Could not hide duplicate fixture clubs: ${error.message}`);
    }
  }

  for (const clubId of canonicalIds) {
    await validateClubOffering(blockId, clubId);
  }

  return canonicalIds.length;
}

async function writeGoogleTestData({
  accessToken,
  yearWorkbookId,
  blockWorkbookId,

}: {
  accessToken: string;
  yearWorkbookId: string | null;
  blockWorkbookId: string | null;
}) {
  if (!accessToken || !yearWorkbookId || !blockWorkbookId) {
    return false;
  }

  const googleRosterOutputTabsToClear: Array<[string, string]> = [
    ['Draft Coded Assignments', 'A:ZZ'],
    ['Draft Named Rosters', 'A:ZZ'],
    ['Final Named Rosters', 'A:ZZ'],
    ['Final Coded Assignments', 'A:ZZ'],
    ['Students with No Club', 'A:ZZ'],
    ['Students Needing More Clubs', 'A:ZZ'],
    ['Club Size Check', 'A:ZZ'],
  ];

  for (const [sheetName, clearRange] of googleRosterOutputTabsToClear) {
    try {
      await clearSheetRange({
        accessToken,
        spreadsheetId: blockWorkbookId,
        range: rangeForSheet(sheetName, clearRange),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const missingSheet =
        message.includes('unable to parse range') ||
        message.includes('not found') ||
        message.includes('cannot find') ||
        message.includes('sheet');

      if (!missingSheet) {
        throw error;
      }
    }
  }


  await clearSheetRange({
    accessToken,
    spreadsheetId: yearWorkbookId,
    range: rangeForSheet('Homerooms', 'A:D'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: yearWorkbookId,
    range: rangeForSheet('Homerooms', 'A1'),
    values: homeroomSheetValues(),
    valueInputOption: 'RAW',
  });

  await clearSheetRange({
    accessToken,
    spreadsheetId: yearWorkbookId,
    range: rangeForSheet('Student Map', 'A:I'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: yearWorkbookId,
    range: rangeForSheet('Student Map', 'A1'),
    values: studentMapSheetValues(),
    valueInputOption: 'RAW',
  });

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Homerooms', 'A:D'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Homerooms', 'A1'),
    values: homeroomSheetValues(),
    valueInputOption: 'RAW',
  });

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Student Map', 'A:I'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Student Map', 'A1'),
    values: studentMapSheetValues(),
    valueInputOption: 'RAW',
  });

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Coded Choices Export', 'A:ZZ'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Coded Choices Export', 'A1'),
    values: codedChoicesSheetValues(),
    valueInputOption: 'RAW',
  });

  return true;
}

async function filterGoogleRowsByPrefix({
  accessToken,
  spreadsheetId,
  sheetName,
  range,
  matchColumnIndex,
  prefix,
}: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  range: string;
  matchColumnIndex: number;
  prefix: string;
}) {
  const response = await readSheetValues({
    accessToken,
    spreadsheetId,
    range: rangeForSheet(sheetName, range),
  });

  const values = response.values ?? [];

  if (values.length === 0) return;

  const [header, ...rows] = values;
  const filteredRows = rows.filter((row) => {
    const value = String(row[matchColumnIndex] ?? '');
    return !value.startsWith(prefix);
  });

  await clearSheetRange({ accessToken, spreadsheetId, range: rangeForSheet(sheetName, range) });
  await writeSheetValues({
    accessToken,
    spreadsheetId,
    range: rangeForSheet(sheetName, 'A1'),
    values: [header, ...filteredRows],
    valueInputOption: 'RAW',
  });
}

async function clearOptionalGoogleSheet({
  accessToken,
  spreadsheetId,
  sheetName,
  clearRange = 'A:ZZ',
}: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  clearRange?: string;
}) {
  try {
    await clearSheetRange({
      accessToken,
      spreadsheetId,
      range: rangeForSheet(sheetName, clearRange),
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const missingSheet =
      message.includes('unable to parse range') ||
      message.includes('not found') ||
      message.includes('cannot find') ||
      message.includes('sheet');

    if (!missingSheet) throw error;
    return false;
  }
}

async function resetCurrentBlockGoogleFormState({
  schoolYearId,
  blockId,
}: {
  schoolYearId: string;
  blockId: string;
}) {
  const admin = createAdminClient();
  const accessToken = await getProviderToken();

  const { data: workspace, error: workspaceError } = await admin
    .from('google_workspace_links')
    .select(
      'google_setup_workbook_id, google_student_form_id, google_student_form_edit_url, google_student_form_responder_url'
    )
    .eq('school_year_id', schoolYearId)
    .eq('block_id', blockId)
    .maybeSingle();

  if (workspaceError) {
    throw new Error(`Could not load the current block Google Form: ${workspaceError.message}`);
  }

  const formId = String(workspace?.google_student_form_id ?? '').trim();
  const workbookId = String(workspace?.google_setup_workbook_id ?? '').trim();
  let formMovedToTrash = false;
  let workbookCleared = false;
  let warning = '';

  if (formId) {
    if (!accessToken) {
      throw new Error(
        'The test form is still saved, but Google is not connected. Reconnect Google before running the destructive test reset.'
      );
    }

    try {
      await googleJsonFetch({
        accessToken,
        url: `https://www.googleapis.com/drive/v3/files/${formId}?fields=id,trashed`,
        method: 'PATCH',
        body: { trashed: true },
      });
      formMovedToTrash = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Google Drive error.';
      const normalized = message.toLowerCase();
      const unavailable = normalized.includes('not found') || normalized.includes('trashed');
      if (!unavailable) {
        throw new Error(
          `The old test form could not be moved to Google Drive trash, so its saved links were preserved: ${message}`
        );
      }
      warning = 'The prior form was already unavailable in Google Drive.';
    }
  }

  if (workbookId && accessToken) {
    await clearOptionalGoogleSheet({ accessToken, spreadsheetId: workbookId, sheetName: 'Form Responses' });
    await clearOptionalGoogleSheet({ accessToken, spreadsheetId: workbookId, sheetName: 'Response Review' });
    await clearOptionalGoogleSheet({ accessToken, spreadsheetId: workbookId, sheetName: 'Coded Choices Export' });
    await clearOptionalGoogleSheet({
      accessToken,
      spreadsheetId: workbookId,
      sheetName: 'Settings',
      clearRange: 'A10:B30',
    });
    workbookCleared = true;
  }

  const { error: clearLinkError } = await admin
    .from('google_workspace_links')
    .update({
      google_student_form_id: null,
      google_student_form_edit_url: null,
      google_student_form_responder_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('school_year_id', schoolYearId)
    .eq('block_id', blockId);

  if (clearLinkError) {
    throw new Error(
      `The old test form was reset in Google, but Scheduler could not clear its saved link: ${clearLinkError.message}`
    );
  }

  return { hadSavedForm: Boolean(formId), formMovedToTrash, workbookCleared, warning };
}



async function hardResetDelete(label: string, deleteRequest: PromiseLike<{ error: any }>) {
  const result = await deleteRequest;

  if (result.error) {
    const message = String(result.error.message ?? '');
    const normalized = message.toLowerCase();
    const ignorable =
      normalized.includes('does not exist') ||
      normalized.includes('schema cache') ||
      normalized.includes('could not find') ||
      normalized.includes('column') ||
      normalized.includes('relation');

    if (!ignorable) {
      throw new Error(`${label}: ${message}`);
    }
  }
}

async function hardResetCurrentBlockForTestData(blockId: string) {
  const admin = createAdminClient();

  const testClubTitles = testClubs.map((club) => club.club_title);
  const { data: fixtureClubs = [], error: fixtureClubsError } = await admin
    .from('club_offerings')
    .select('id')
    .eq('block_id', blockId)
    .in('club_title', testClubTitles);

  if (fixtureClubsError) {
    throw new Error(`Could not find fixture clubs: ${fixtureClubsError.message}`);
  }

  const fixtureClubIds = (fixtureClubs ?? []).map((row) => row.id as string).filter(Boolean);

  const { data: testStudents = [], error: testStudentsError } = await admin
    .from('students')
    .select('id')
    .like('external_student_id', `${TEST_STUDENT_CODE_PREFIX}%`);

  if (testStudentsError) {
    throw new Error(`Could not find test students: ${testStudentsError.message}`);
  }

  const testStudentIds = (testStudents ?? []).map((row) => row.id as string).filter(Boolean);

  const { data: matchRuns = [], error: matchRunsError } = await admin
    .from('match_runs')
    .select('id')
    .eq('block_id', blockId);

  if (matchRunsError) {
    throw new Error(`Could not find match runs: ${matchRunsError.message}`);
  }

  const matchRunIds = (matchRuns ?? []).map((row) => row.id as string).filter(Boolean);

  let historySnapshotIds: string[] = [];
  const { data: historySnapshots = [], error: historyError } = await admin
    .from('history_snapshots')
    .select('id')
    .eq('block_id', blockId);

  if (!historyError) {
    historySnapshotIds = (historySnapshots ?? []).map((row) => row.id as string).filter(Boolean);
  }

  let submissionIds: string[] = [];
  if (testStudentIds.length > 0) {
    const { data: submissions = [], error: submissionsError } = await admin
      .from('student_submissions')
      .select('id')
      .eq('block_id', blockId)
      .in('student_id', testStudentIds);

    if (submissionsError) {
      throw new Error(`Could not find test submissions: ${submissionsError.message}`);
    }

    submissionIds = (submissions ?? []).map((row) => row.id as string).filter(Boolean);
  }

  if (historySnapshotIds.length > 0) {
    await hardResetDelete('Could not clear history student outcomes', admin.from('history_student_outcomes').delete().in('history_snapshot_id', historySnapshotIds));
    await hardResetDelete('Could not clear history snapshots', admin.from('history_snapshots').delete().in('id', historySnapshotIds));
  }

  await hardResetDelete('Could not clear assignment overrides', admin.from('assignment_overrides').delete().eq('block_id', blockId));
  await hardResetDelete('Could not clear final assignments', admin.from('final_assignments').delete().eq('block_id', blockId));
  await hardResetDelete('Could not clear below-minimum decisions', admin.from('below_minimum_decisions').delete().eq('block_id', blockId));

  if (matchRunIds.length > 0) {
    await hardResetDelete('Could not clear match demand summaries', admin.from('match_demand_summaries').delete().in('match_run_id', matchRunIds));
    await hardResetDelete('Could not clear draft assignments', admin.from('draft_assignments').delete().in('match_run_id', matchRunIds));
  }

  if (submissionIds.length > 0) {
    await hardResetDelete('Could not clear student interest ratings', admin.from('student_interest_ratings').delete().in('student_submission_id', submissionIds));
    await hardResetDelete('Could not clear student submissions', admin.from('student_submissions').delete().in('id', submissionIds));
  }

  if (fixtureClubIds.length > 0) {
    await hardResetDelete('Could not clear ratings for fixture clubs', admin.from('student_interest_ratings').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear submissions with fixture top choices', admin.from('student_submissions').delete().in('top_choice_club_id', fixtureClubIds));
    await hardResetDelete('Could not clear club validation issues', admin.from('club_validation_issues').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear demand summaries for fixture clubs', admin.from('match_demand_summaries').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear draft assignments for fixture clubs', admin.from('draft_assignments').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear final assignments for fixture clubs', admin.from('final_assignments').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not delete fixture clubs', admin.from('club_offerings').delete().in('id', fixtureClubIds));
  }

  if (matchRunIds.length > 0) {
    await hardResetDelete('Could not clear match runs', admin.from('match_runs').delete().in('id', matchRunIds));
  }

  return {
    fixtureClubCount: fixtureClubIds.length,
    testStudentCount: testStudentIds.length,
    submissionCount: submissionIds.length,
    matchRunCount: matchRunIds.length,
    historySnapshotCount: historySnapshotIds.length,
  };
}


function isHardResetIgnorableError(message: string) {
  const normalized = String(message ?? '').toLowerCase();

  return (
    normalized.includes('does not exist') ||
    normalized.includes('schema cache') ||
    normalized.includes('could not find') ||
    normalized.includes('column') ||
    normalized.includes('relation')
  );
}

async function fullWipeActiveBlockWorkflowData(blockId: string) {
  const admin = createAdminClient();

  const testClubTitles = testClubs.map((club) => club.club_title);

  const { data: fixtureClubs = [], error: fixtureClubsError } = await admin
    .from('club_offerings')
    .select('id')
    .eq('block_id', blockId)
    .in('club_title', testClubTitles);

  if (fixtureClubsError) {
    throw new Error(`Could not find fixture clubs: ${fixtureClubsError.message}`);
  }

  const fixtureClubIds = (fixtureClubs ?? []).map((row) => row.id as string).filter(Boolean);

  const { data: allSubmissions = [], error: allSubmissionsError } = await admin
    .from('student_submissions')
    .select('id')
    .eq('block_id', blockId);

  if (allSubmissionsError) {
    throw new Error(`Could not find block submissions: ${allSubmissionsError.message}`);
  }

  const allSubmissionIds = (allSubmissions ?? []).map((row) => row.id as string).filter(Boolean);

  const { data: matchRuns = [], error: matchRunsError } = await admin
    .from('match_runs')
    .select('id')
    .eq('block_id', blockId);

  if (matchRunsError) {
    throw new Error(`Could not find match runs: ${matchRunsError.message}`);
  }

  const matchRunIds = (matchRuns ?? []).map((row) => row.id as string).filter(Boolean);

  let historySnapshotIds: string[] = [];
  const { data: historySnapshots = [], error: historyError } = await admin
    .from('history_snapshots')
    .select('id')
    .eq('block_id', blockId);

  if (!historyError) {
    historySnapshotIds = (historySnapshots ?? []).map((row) => row.id as string).filter(Boolean);
  } else if (!isHardResetIgnorableError(historyError.message ?? '')) {
    throw new Error(`Could not find history snapshots: ${historyError.message}`);
  }

  if (historySnapshotIds.length > 0) {
    await hardResetDelete('Could not clear history student outcomes', admin.from('history_student_outcomes').delete().in('history_snapshot_id', historySnapshotIds));
    await hardResetDelete('Could not clear history snapshots', admin.from('history_snapshots').delete().in('id', historySnapshotIds));
  }

  await hardResetDelete('Could not clear assignment overrides', admin.from('assignment_overrides').delete().eq('block_id', blockId));
  await hardResetDelete('Could not clear final assignments', admin.from('final_assignments').delete().eq('block_id', blockId));
  await hardResetDelete('Could not clear below-minimum decisions', admin.from('below_minimum_decisions').delete().eq('block_id', blockId));

  if (matchRunIds.length > 0) {
    await hardResetDelete('Could not clear match demand summaries', admin.from('match_demand_summaries').delete().in('match_run_id', matchRunIds));
    await hardResetDelete('Could not clear draft assignments', admin.from('draft_assignments').delete().in('match_run_id', matchRunIds));
  }

  if (allSubmissionIds.length > 0) {
    await hardResetDelete('Could not clear student interest ratings', admin.from('student_interest_ratings').delete().in('student_submission_id', allSubmissionIds));
    await hardResetDelete('Could not clear student submissions', admin.from('student_submissions').delete().in('id', allSubmissionIds));
  }

  if (fixtureClubIds.length > 0) {
    await hardResetDelete('Could not clear ratings for fixture clubs', admin.from('student_interest_ratings').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear submissions with fixture top choices', admin.from('student_submissions').delete().in('top_choice_club_id', fixtureClubIds));
    await hardResetDelete('Could not clear club validation issues', admin.from('club_validation_issues').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear demand summaries for fixture clubs', admin.from('match_demand_summaries').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear draft assignments for fixture clubs', admin.from('draft_assignments').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not clear final assignments for fixture clubs', admin.from('final_assignments').delete().in('club_offering_id', fixtureClubIds));
    await hardResetDelete('Could not delete fixture clubs', admin.from('club_offerings').delete().in('id', fixtureClubIds));
  }

  if (matchRunIds.length > 0) {
    await hardResetDelete('Could not clear match runs', admin.from('match_runs').delete().in('id', matchRunIds));
  }

  return {
    clearedSubmissionCount: allSubmissionIds.length,
    clearedMatchRunCount: matchRunIds.length,
    clearedFixtureClubCount: fixtureClubIds.length,
    clearedHistorySnapshotCount: historySnapshotIds.length,
  };
}


type StudentMapForSimulation = {
  studentCode: string;
  grade: number;
  homeroomCode: string;
};

type ClubForSimulation = {
  clubTitle: string;
  sectionLabel: string;
  gradeLimited: boolean;
  eligibleGrade: number | null;
  eligibleGrades: number[];
};

function normalizedHeader(value: unknown) {
  return String(value ?? '').trim().replace(/_/g, ' ').replace(/s+/g, ' ').toLowerCase();
}

function headerIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizedHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizedHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function parseGrade(value: unknown) {
  const match = String(value ?? '').match(/[0-9]+/);
  return match ? Number(match[0]) : 0;
}

function normalizeEligibleGradeList(value: unknown) {
  if (!Array.isArray(value)) return [] as number[];
  return value
    .map((item) => Number(item))
    .filter((item) => [3, 4, 5].includes(item));
}

function displayClubForSimulation(club: ClubForSimulation) {
  return club.sectionLabel ? club.clubTitle + ' (' + club.sectionLabel + ')' : club.clubTitle;
}

function clubIsEligibleForGrade(club: ClubForSimulation, grade: number) {
  if (!club.gradeLimited) return true;
  if (club.eligibleGrades.length > 0) return club.eligibleGrades.includes(grade);
  if (club.eligibleGrade) return club.eligibleGrade === grade;
  return true;
}

function deterministicScore(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function simulatedInterestLevel(studentCode: string, clubName: string, rank: number) {
  const score = deterministicScore(studentCode + '|' + clubName);
  const popularBoost = rank < 3 ? 0.13 : rank < 6 ? 0.06 : 0;
  const adjusted = Math.min(0.99, score + popularBoost);
  if (adjusted >= 0.78) return 'Definitely';
  if (adjusted >= 0.43) return 'Maybe';
  return 'No thanks';
}

function simulatedMaxClubs(studentCode: string) {
  const score = deterministicScore(studentCode + '|max-clubs');
  if (score < 0.2) return '1';
  if (score < 0.72) return '2';
  return '3';
}

function readStudentMapRowsForSimulation(values: string[][]) {
  if (values.length < 2) return [] as StudentMapForSimulation[];
  const headers = values[0] ?? [];
  const codeIndex = headerIndex(headers, ['student_code', 'student code']);
  const gradeIndex = headerIndex(headers, ['grade']);
  const homeroomCodeIndex = headerIndex(headers, ['homeroom_code', 'homeroom code']);

  if (codeIndex < 0 || gradeIndex < 0) {
    throw new Error('Student Map must include student_code and grade columns before simulating choices.');
  }

  return values.slice(1)
    .map((row) => ({
      studentCode: String(row[codeIndex] ?? '').trim(),
      grade: parseGrade(row[gradeIndex]),
      homeroomCode: homeroomCodeIndex >= 0 ? String(row[homeroomCodeIndex] ?? '').trim() : '',
    }))
    .filter((row) => row.studentCode && [3, 4, 5].includes(row.grade));
}

async function loadActiveClubsForSimulation(blockId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('club_offerings')
    .select('club_title, section_label, grade_limited, eligible_grade, eligible_grades')
    .eq('block_id', blockId)
    .eq('is_active', true)
    .eq('show_to_students', true)
    .order('club_title', { ascending: true });

  if (error) {
    throw new Error('Could not load active clubs for simulated choices: ' + error.message);
  }

  return (data ?? [])
    .map((club) => ({
      clubTitle: String(club.club_title ?? '').trim(),
      sectionLabel: String(club.section_label ?? '').trim(),
      gradeLimited: Boolean(club.grade_limited),
      eligibleGrade: club.eligible_grade === null || club.eligible_grade === undefined
        ? null
        : Number(club.eligible_grade),
      eligibleGrades: normalizeEligibleGradeList(club.eligible_grades),
    }))
    .filter((club) => club.clubTitle) as ClubForSimulation[];
}

function buildSimulatedCodedChoiceRows({
  students,
  clubs,
}: {
  students: StudentMapForSimulation[];
  clubs: ClubForSimulation[];
}) {
  const clubHeaders = clubs.map(displayClubForSimulation);
  const header = ['student_code', 'grade', 'homeroom_code', 'max_clubs', 'top_choice', ...clubHeaders];
  const rows = students.map((student) => {
    const eligibleClubs = clubs.filter((club) => clubIsEligibleForGrade(club, student.grade));
    const ratings = clubs.map((club, index) => {
      if (!clubIsEligibleForGrade(club, student.grade)) return 'No thanks';
      return simulatedInterestLevel(student.studentCode, displayClubForSimulation(club), index);
    });

    const topChoice =
      eligibleClubs.find((club) => {
        const index = clubs.indexOf(club);
        return ratings[index] === 'Definitely';
      }) ??
      eligibleClubs.find((club) => {
        const index = clubs.indexOf(club);
        return ratings[index] === 'Maybe';
      }) ??
      eligibleClubs[0] ??
      null;

    return [
      student.studentCode,
      String(student.grade),
      student.homeroomCode,
      simulatedMaxClubs(student.studentCode),
      topChoice ? displayClubForSimulation(topChoice) : '',
      ...ratings,
    ];
  });

  return [header, ...rows];
}

export async function simulateCodedStudentChoices(): Promise<TestDataResult> {
  assertTestDataEnabled();
  await requireRole(['admin']);

  const { year, block } = await getActiveContext();
  if (!year || !block) {
    return { ok: false, message: 'Set an active school year and block before simulating coded choices.' };
  }

  const accessToken = await getProviderToken();
  if (!accessToken) {
    return {
      ok: false,
      message: 'Google is not connected. Reconnect Google before simulating coded choices.',
    };
  }

  const workspaceIds = await getWorkspaceIds({ schoolYearId: year.id, blockId: block.id });
  if (!workspaceIds.blockWorkbookId) {
    return {
      ok: false,
      message: 'Create the Google block workbook before simulating coded choices.',
    };
  }

  const studentMap = await readSheetValues({
    accessToken,
    spreadsheetId: workspaceIds.blockWorkbookId,
    range: rangeForSheet('Student Map', 'A:I'),
  });
  const students = readStudentMapRowsForSimulation(studentMap.values ?? []);
  if (students.length === 0) {
    return {
      ok: false,
      message: 'No usable students were found in the block workbook Student Map. Seed test data first.',
    };
  }

  const clubs = await loadActiveClubsForSimulation(block.id);
  if (clubs.length === 0) {
    return {
      ok: false,
      message: 'No active student-visible clubs were found for the current block. Seed or create clubs first.',
    };
  }

  const values = buildSimulatedCodedChoiceRows({ students, clubs });
  await clearSheetRange({
    accessToken,
    spreadsheetId: workspaceIds.blockWorkbookId,
    range: rangeForSheet('Coded Choices Export', 'A:ZZ'),
  });
  await writeSheetValues({
    accessToken,
    spreadsheetId: workspaceIds.blockWorkbookId,
    range: rangeForSheet('Coded Choices Export', 'A1'),
    values,
    valueInputOption: 'RAW',
  });

  revalidateTestDataPaths();

  return {
    ok: true,
    message:
      'Simulated coded student choices were written to Coded Choices Export. This does not create Google Form responses or fake verified student emails.',
    studentCount: students.length,
    clubCount: clubs.length,
    choiceCount: students.length,
    simulatedChoiceCount: students.length,
    googleUpdated: true,
  };
}

export async function fullWipeActiveBlockAndSeedMediumTestData(): Promise<TestDataResult> {
  assertTestDataEnabled();
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'Set an active school year and block before wiping test data.' };
  }

  const formReset = await resetCurrentBlockGoogleFormState({
    schoolYearId: year.id,
    blockId: block.id,
  });

  const wipeSummary = await fullWipeActiveBlockWorkflowData(block.id);
  const seedResult = await seedMediumTestData();

  if (seedResult.ok) {
    const formSummary = formReset.formMovedToTrash
      ? ' The previous test form was moved to Google Drive trash and its saved links were cleared.'
      : formReset.hadSavedForm
        ? ' The previous form links were cleared.'
        : ' No saved test form was present.';
    const workbookSummary = formReset.workbookCleared
      ? ' Form response and response-review data were cleared from the block workbook.'
      : '';
    const warningSummary = formReset.warning ? ' ' + formReset.warning : '';
    seedResult.message +=
      formSummary +
      workbookSummary +
      warningSummary +
      ' The block is ready to generate a new Google Form.';
  }

  return {
    ...seedResult,
    message: seedResult.ok
      ? `Full block wipe complete. Cleared ${wipeSummary.clearedSubmissionCount} block submission(s), ${wipeSummary.clearedMatchRunCount} match run(s), ${wipeSummary.clearedFixtureClubCount} fixture club(s), and ${wipeSummary.clearedHistorySnapshotCount} history snapshot(s). Seeded fresh medium test data.`
      : seedResult.message,
  };
}

export async function hardResetAndSeedMediumTestData(): Promise<TestDataResult> {
  assertTestDataEnabled();
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'Set an active school year and block before hard resetting test data.' };
  }

  const formReset = await resetCurrentBlockGoogleFormState({
    schoolYearId: year.id,
    blockId: block.id,
  });

  const resetSummary = await hardResetCurrentBlockForTestData(block.id);
  const seedResult = await seedMediumTestData();

  if (seedResult.ok) {
    const formSummary = formReset.formMovedToTrash
      ? ' The previous test form was moved to Google Drive trash and its saved links were cleared.'
      : formReset.hadSavedForm
        ? ' The previous form links were cleared.'
        : ' No saved test form was present.';
    const workbookSummary = formReset.workbookCleared
      ? ' Form response and response-review data were cleared from the block workbook.'
      : '';
    const warningSummary = formReset.warning ? ' ' + formReset.warning : '';
    seedResult.message +=
      formSummary +
      workbookSummary +
      warningSummary +
      ' The block is ready to generate a new Google Form.';
  }

  return {
    ...seedResult,
    message: seedResult.ok
      ? `Hard reset complete. Cleared ${resetSummary.matchRunCount} match run(s), ${resetSummary.submissionCount} imported submission(s), ${resetSummary.fixtureClubCount} fixture club(s), and ${resetSummary.historySnapshotCount} history snapshot(s). Seeded fresh medium test data.`
      : seedResult.message,
  };
}

export async function seedMediumTestData(): Promise<TestDataResult> {
  assertTestDataEnabled();
  const user = await requireRole(['admin']);
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'Set an active school year and block before seeding test data.' };
  }

  await upsertHomerooms();
  const clubCount = await upsertClubs({ blockId: block.id, userId: user.id });

  const providerToken = await getProviderToken();
  const workspaceIds = await getWorkspaceIds({ schoolYearId: year.id, blockId: block.id });

  const googleUpdated = providerToken
    ? await writeGoogleTestData({
        accessToken: providerToken,
        yearWorkbookId: workspaceIds.yearWorkbookId,
        blockWorkbookId: workspaceIds.blockWorkbookId,
      })
    : false;

  revalidateTestDataPaths();

  return {
    ok: true,
    message: googleUpdated
      ? 'Seeded medium test data in Scheduler and Google workbooks. Existing fixture clubs were updated in place, and duplicate fixture clubs were hidden rather than deleted.'
      : 'Seeded medium test data in Scheduler. Google was not updated because the workbooks or connection were not available.',
    homeroomCount: testHomerooms.length,
    clubCount,
    studentCount: studentMapSheetValues().length - 1,
    choiceCount: codedChoicesSheetValues().length - 1,
    googleUpdated,
  };
}

export async function clearMediumTestData(): Promise<TestDataResult> {
  assertTestDataEnabled();
  await requireRole(['admin']);
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'Set an active school year and block before clearing test data.' };
  }

  const admin = createAdminClient();

  const existingClubs = await getExistingFixtureNamedClubs(block.id);
  const existingClubIds = existingClubs.map((club) => club.id);

  if (existingClubIds.length > 0) {
    const { error } = await admin
      .from('club_offerings')
      .update({
        is_active: false,
        show_to_students: false,
        admin_notes: `${TEST_FIXTURE_MARKER} hidden by clear test data`,
      })
      .in('id', existingClubIds);

    if (error) {
      throw new Error(`Could not hide fixture clubs: ${error.message}`);
    }
  }

  for (const homeroom of testHomerooms) {
    const { error } = await admin
      .from('teachers')
      .update({ is_active: false })
      .eq('homeroom_code', homeroom.homeroom_code);

    if (error) {
      throw new Error(`Could not hide test homeroom ${homeroom.homeroom_name}: ${error.message}`);
    }
  }

  const providerToken = await getProviderToken();
  const workspaceIds = await getWorkspaceIds({ schoolYearId: year.id, blockId: block.id });
  let googleUpdated = false;

  if (providerToken && workspaceIds.yearWorkbookId && workspaceIds.blockWorkbookId) {
    await filterGoogleRowsByPrefix({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.yearWorkbookId,
      sheetName: 'Student Map',
      range: 'A:I',
      matchColumnIndex: 0,
      prefix: TEST_STUDENT_CODE_PREFIX,
    });

    await filterGoogleRowsByPrefix({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.blockWorkbookId,
      sheetName: 'Student Map',
      range: 'A:I',
      matchColumnIndex: 0,
      prefix: TEST_STUDENT_CODE_PREFIX,
    });

    await filterGoogleRowsByPrefix({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.blockWorkbookId,
      sheetName: 'Coded Choices Export',
      range: 'A:ZZ',
      matchColumnIndex: 0,
      prefix: TEST_STUDENT_CODE_PREFIX,
    });

    await filterGoogleRowsByPrefix({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.yearWorkbookId,
      sheetName: 'Homerooms',
      range: 'A:D',
      matchColumnIndex: 0,
      prefix: TEST_HOMEROOM_CODE_PREFIX,
    });

    await filterGoogleRowsByPrefix({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.blockWorkbookId,
      sheetName: 'Homerooms',
      range: 'A:D',
      matchColumnIndex: 0,
      prefix: TEST_HOMEROOM_CODE_PREFIX,
    });

    googleUpdated = true;
  }

  revalidateTestDataPaths();

  return {
    ok: true,
    message: googleUpdated
      ? 'Cleared medium test fixture rows from Google and hid fixture clubs and homerooms in Scheduler.'
      : 'Hid fixture clubs and homerooms in Scheduler. Google was not updated because the workbooks or connection were not available.',
    googleUpdated,
  };
}



async function moveGoogleFileToTrash({
  accessToken,
  fileId,
  label,
}: {
  accessToken: string;
  fileId: string | null | undefined;
  label: string;
}) {
  const normalizedId = String(fileId ?? '').trim();
  if (!normalizedId) return false;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${normalizedId}?fields=id,trashed`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    }
  );

  const responseText = await response.text();
  const responseJson = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const message =
      responseJson?.error?.message ??
      responseJson?.message ??
      `Google request failed with status ${response.status}.`;
    const normalizedMessage = String(message).toLowerCase();

    if (
      response.status === 404 ||
      normalizedMessage.includes('not found') ||
      normalizedMessage.includes('file not found')
    ) {
      return false;
    }

    throw new Error(`Could not move the ${label} to Google Drive trash: ${message}`);
  }

  return true;
}

export async function resetGoogleTestWorkspace(): Promise<TestDataResult> {
  assertTestDataEnabled();
  await requireRole(['admin']);

  const { year, block } = await getActiveContext();
  if (!year || !block) {
    return {
      ok: false,
      message: 'Set an active school year and block before resetting the Google test workspace.',
    };
  }

  const accessToken = await getProviderToken();
  if (!accessToken) {
    return {
      ok: false,
      message:
        'Google is not connected. Reconnect Google before resetting the test workspace so the old files can be moved to trash safely.',
    };
  }

  const admin = createAdminClient();
  const { data: workspace, error: workspaceError } = await admin
    .from('google_workspace_links')
    .select(
      'google_block_folder_id, google_setup_workbook_id, google_student_form_id'
    )
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (workspaceError) {
    return {
      ok: false,
      message: `Could not load the current Google block workspace: ${workspaceError.message}`,
    };
  }

  try {
    const formTrashed = await moveGoogleFileToTrash({
      accessToken,
      fileId: workspace?.google_student_form_id,
      label: 'student form',
    });

    const workbookTrashed = await moveGoogleFileToTrash({
      accessToken,
      fileId: workspace?.google_setup_workbook_id,
      label: 'block workbook',
    });

    const folderTrashed = await moveGoogleFileToTrash({
      accessToken,
      fileId: workspace?.google_block_folder_id,
      label: 'block folder',
    });

    const wipeSummary = await fullWipeActiveBlockWorkflowData(block.id);

    const { error: clearError } = await admin
      .from('google_workspace_links')
      .update({
        google_block_folder_id: null,
        google_setup_workbook_id: null,
        google_setup_workbook_url: null,
        google_student_form_id: null,
        google_student_form_edit_url: null,
        google_student_form_responder_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('school_year_id', year.id)
      .eq('block_id', block.id);

    if (clearError) {
      throw new Error(
        `Google files were reset, but Scheduler could not clear the saved block workspace links: ${clearError.message}`
      );
    }

    revalidateTestDataPaths();
    revalidatePath('/admin/prepare-form');

    const moved = [
      formTrashed ? 'form' : null,
      workbookTrashed ? 'workbook' : null,
      folderTrashed ? 'folder' : null,
    ].filter(Boolean);

    return {
      ok: true,
      googleUpdated: moved.length > 0,
      googleWorkspaceReset: true,
      message:
        `Google test workspace reset complete. ${
          moved.length > 0
            ? 'Moved the old ' + moved.join(', ') + ' to Google Drive trash. '
            : 'The old Google files were already unavailable. '
        }Cleared ${wipeSummary.clearedSubmissionCount} block submission(s), ${
          wipeSummary.clearedMatchRunCount
        } match run(s), ${wipeSummary.clearedFixtureClubCount} fixture club(s), and ${
          wipeSummary.clearedHistorySnapshotCount
        } history snapshot(s). The year workspace was preserved. Create a new block workspace before seeding test data.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not reset the Google test workspace.';

    return {
      ok: false,
      message,
    };
  }
}
