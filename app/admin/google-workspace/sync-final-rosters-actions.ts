'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getGoogleWorkspaceIdsForBlock,
  rangeForSheet,
  readSheetValues,
  refreshBlockWorkbookFromYearSetup,
} from './google-workbook-utils';

type SyncFinalRostersResult = {
  ok: boolean;
  message: string;
  importedCount?: number;
  skippedCount?: number;
  issueCount?: number;
  refreshedStudentMap?: boolean;
  studentMapRowCount?: number;
  homeroomRowCount?: number;
};

type FinalCodedRow = {
  studentCode: string;
  clubTitle: string;
  sectionLabel: string;
  assignmentOrder: number;
  rowNumber: number;
};

const FINAL_CODED_ASSIGNMENTS_TAB = 'Final Coded Assignments';

function googlePermissionMessage() {
  return [
    'Google is not connected with Sheets access yet.',
    'Click Connect Google, approve the requested permissions, then try again.',
  ].join(' ');
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeHeader(value: string | null | undefined) {
  return normalizeText(value).replace(/_/g, ' ');
}

function clubKey({
  clubTitle,
  sectionLabel,
}: {
  clubTitle: string | null | undefined;
  sectionLabel: string | null | undefined;
}) {
  return `${normalizeText(clubTitle)}|${normalizeText(sectionLabel)}`;
}

function parseFinalCodedRows(values: string[][]): {
  rows: FinalCodedRow[];
  issues: string[];
} {
  const issues: string[] = [];

  if (values.length < 2) {
    return {
      rows: [],
      issues: ['No final coded assignment rows were found.'],
    };
  }

  const headers = values[0].map(normalizeHeader);

  const studentCodeIndex = headers.findIndex((header) => header === 'student code');
  const clubTitleIndex = headers.findIndex((header) => header === 'club title');
  const sectionLabelIndex = headers.findIndex((header) => header === 'section label');
  const assignmentOrderIndex = headers.findIndex((header) => header === 'assignment order');

  if (studentCodeIndex < 0) {
    issues.push('Missing column: student_code');
  }

  if (clubTitleIndex < 0) {
    issues.push('Missing column: club_title');
  }

  if (sectionLabelIndex < 0) {
    issues.push('Missing column: section_label');
  }

  if (issues.length > 0) {
    return {
      rows: [],
      issues,
    };
  }

  const rows: FinalCodedRow[] = [];

  values.slice(1).forEach((valueRow, index) => {
    const rowNumber = index + 2;
    const studentCode = String(valueRow[studentCodeIndex] ?? '').trim();
    const clubTitle = String(valueRow[clubTitleIndex] ?? '').trim();
    const sectionLabel = String(valueRow[sectionLabelIndex] ?? '').trim();

    const assignmentOrderValue =
      assignmentOrderIndex >= 0 ? String(valueRow[assignmentOrderIndex] ?? '').trim() : '';

    const assignmentOrder = Number.parseInt(assignmentOrderValue, 10);

    if (!studentCode && !clubTitle && !sectionLabel) {
      return;
    }

    if (!studentCode) {
      issues.push(`Row ${rowNumber}: missing student_code.`);
      return;
    }

    if (!clubTitle) {
      issues.push(`Row ${rowNumber}: missing club_title.`);
      return;
    }

    rows.push({
      studentCode,
      clubTitle,
      sectionLabel,
      assignmentOrder: Number.isNaN(assignmentOrder) ? index + 1 : assignmentOrder,
      rowNumber,
    });
  });

  return {
    rows,
    issues,
  };
}

async function createOrRefreshHistorySnapshot({
  supabase,
  block,
  userId,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  block: any;
  userId: string;
}) {
  const { data: existingSnapshot, error: existingSnapshotError } = await supabase
    .from('history_snapshots')
    .select('*')
    .eq('block_id', block.id)
    .maybeSingle();

  if (existingSnapshotError) {
    throw new Error(`Could not load saved results: ${existingSnapshotError.message}`);
  }

  let snapshotId = existingSnapshot?.id as string | undefined;

  if (snapshotId) {
    const clearOutcomes = await supabase
      .from('history_student_outcomes')
      .delete()
      .eq('history_snapshot_id', snapshotId);

    if (clearOutcomes.error) {
      throw new Error(`Could not clear prior saved student results: ${clearOutcomes.error.message}`);
    }

    const refreshSnapshot = await supabase
      .from('history_snapshots')
      .update({
        committed_by_user_id: userId,
        committed_at: new Date().toISOString(),
      })
      .eq('id', snapshotId);

    if (refreshSnapshot.error) {
      throw new Error(`Could not refresh saved results: ${refreshSnapshot.error.message}`);
    }
  } else {
    const { data: newSnapshot, error: snapshotError } = await supabase
      .from('history_snapshots')
      .insert({
        block_id: block.id,
        school_year_id: block.school_year_id,
        committed_by_user_id: userId,
        committed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (snapshotError || !newSnapshot) {
      throw new Error(`Could not save results: ${snapshotError?.message ?? 'Unknown error'}`);
    }

    snapshotId = newSnapshot.id;
  }

  const [
    { data: submissions = [], error: submissionsError },
    { data: finals = [], error: finalsError },
  ] = await Promise.all([
    supabase
      .from('student_submissions')
      .select('*')
      .eq('block_id', block.id)
      .eq('is_latest', true),

    supabase.from('final_assignments').select('*').eq('block_id', block.id),
  ]);

  if (submissionsError) {
    throw new Error(`Could not load student choices: ${submissionsError.message}`);
  }

  if (finalsError) {
    throw new Error(`Could not load final rosters: ${finalsError.message}`);
  }

  const finalsByStudent = new Map<string, any[]>();

  for (const finalAssignment of finals as any[]) {
    const existing = finalsByStudent.get(finalAssignment.student_id) ?? [];
    existing.push(finalAssignment);
    finalsByStudent.set(finalAssignment.student_id, existing);
  }

  const outcomeRows = (submissions as any[]).map((submission) => {
    const assigned = finalsByStudent.get(submission.student_id) ?? [];
    const clubsReceived = assigned.length;
    const requested = Number(submission.max_clubs ?? 0);
    const unmetDemand = Math.max(0, requested - clubsReceived);

    const gotTopChoice = Boolean(
      submission.top_choice_club_id &&
        assigned.some(
          (assignment) => assignment.club_offering_id === submission.top_choice_club_id
        )
    );

    return {
      history_snapshot_id: snapshotId,
      student_id: submission.student_id,
      clubs_received: clubsReceived,
      got_top_choice: gotTopChoice,
      unmet_demand: unmetDemand,
      zero_club_flag: requested > 0 && clubsReceived === 0,
    };
  });

  if (outcomeRows.length > 0) {
    const insertOutcomes = await supabase
      .from('history_student_outcomes')
      .insert(outcomeRows);

    if (insertOutcomes.error) {
      throw new Error(`Could not save student results: ${insertOutcomes.error.message}`);
    }
  }
}

export async function syncFinalRostersFromGoogle(): Promise<SyncFinalRostersResult> {
  const user = await requireRole(['admin']);

  const supabaseSession = await createClient();
  const supabase = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return {
      ok: false,
      message: 'No active school year or current session is configured.',
    };
  }
  if ((block as any).status === 'finalized') {
    return {
      ok: false,
      message: 'This session is already finalized.',
    };
  }
  if (!['roster_review', 'review'].includes(String((block as any).status ?? ''))) {
    return {
      ok: false,
      message: 'Send draft rosters to Google before pulling reviewed rosters back to finalize this session.',
    };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabaseSession.auth.getSession();

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

  try {
    const refreshResult = await refreshBlockWorkbookFromYearSetup({
      accessToken: providerToken,
      yearWorkbookId: workspaceIds.ids.yearWorkbookId,
      blockWorkbookId: workspaceIds.ids.blockWorkbookId,
    });

    const sheetData = await readSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(FINAL_CODED_ASSIGNMENTS_TAB, 'A:D'),
    });

    const parsed = parseFinalCodedRows(sheetData.values ?? []);

    if (parsed.issues.length > 0) {
      return {
        ok: false,
        message: parsed.issues.slice(0, 5).join(' '),
        importedCount: 0,
        skippedCount: parsed.issues.length,
        issueCount: parsed.issues.length,
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
      };
    }

    if (parsed.rows.length === 0) {
      return {
        ok: false,
        message: 'No final coded assignments were found in Google.',
        importedCount: 0,
        skippedCount: 0,
        issueCount: 1,
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
      };
    }

    const { data: students = [], error: studentsError } = await supabase
      .from('students')
      .select('id, external_student_id')
      .eq('is_active', true);

    if (studentsError) {
      return {
        ok: false,
        message: `Could not load coded students: ${studentsError.message}`,
      };
    }

    const { data: clubs = [], error: clubsError } = await supabase
      .from('club_offerings')
      .select('id, club_title, section_label')
      .eq('block_id', block.id)
      .eq('is_active', true);

    if (clubsError) {
      return {
        ok: false,
        message: `Could not load clubs: ${clubsError.message}`,
      };
    }

    const studentByCode = new Map<string, string>();

    for (const student of students as any[]) {
      const code = String(student.external_student_id ?? '').trim();

      if (code) {
        studentByCode.set(code, student.id);
      }
    }

    const clubByKey = new Map<string, string>();

    for (const club of clubs as any[]) {
      clubByKey.set(
        clubKey({
          clubTitle: club.club_title,
          sectionLabel: club.section_label,
        }),
        club.id
      );
    }

    const issues: string[] = [];
    const finalRows: Array<{
      block_id: string;
      student_id: string;
      club_offering_id: string;
      finalized_by_user_id: string;
    }> = [];

    const seenFinalAssignmentKeys = new Set<string>();
    let duplicateAssignmentCount = 0;

    for (const row of parsed.rows) {
      const studentId = studentByCode.get(row.studentCode);

      if (!studentId) {
        issues.push(`Row ${row.rowNumber}: unknown student_code ${row.studentCode}.`);
        continue;
      }

      const clubId = clubByKey.get(
        clubKey({
          clubTitle: row.clubTitle,
          sectionLabel: row.sectionLabel,
        })
      );

      if (!clubId) {
        issues.push(
          `Row ${row.rowNumber}: unknown club ${row.clubTitle}${
            row.sectionLabel ? ` (${row.sectionLabel})` : ''
          }.`
        );
        continue;
      }

      const finalAssignmentKey = `${studentId}|${clubId}`;

      if (seenFinalAssignmentKeys.has(finalAssignmentKey)) {
        duplicateAssignmentCount += 1;
        continue;
      }

      seenFinalAssignmentKeys.add(finalAssignmentKey);

      finalRows.push({
        block_id: block.id,
        student_id: studentId,
        club_offering_id: clubId,
        finalized_by_user_id: user.id,
      });
    }

    if (issues.length > 0) {
      return {
        ok: false,
        message: issues.slice(0, 5).join(' '),
        importedCount: 0,
        skippedCount: issues.length,
        issueCount: issues.length,
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
      };
    }

    const deleteExisting = await supabase
      .from('final_assignments')
      .delete()
      .eq('block_id', block.id);

    if (deleteExisting.error) {
      return {
        ok: false,
        message: `Could not clear prior final rosters: ${deleteExisting.error.message}`,
      };
    }

    if (finalRows.length > 0) {
      const insertFinals = await supabase.from('final_assignments').insert(finalRows);

      if (insertFinals.error) {
        return {
          ok: false,
          message: `Could not save final rosters: ${insertFinals.error.message}`,
        };
      }
    }
    const updateBlock = await supabase
      .from('blocks')
      .update({
        status: 'review',
        matching_locked: false,
        finalized_at: null,
      })
      .eq('id', block.id);

    if (updateBlock.error) {
      return {
        ok: false,
        message: `Final rosters were saved, but Workflow could not remain on the final-check step: ${updateBlock.error.message}`,
        importedCount: finalRows.length,
        skippedCount: 0,
        issueCount: 1,
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
      };
    }

    return {
      ok: true,
      message:
        duplicateAssignmentCount > 0
          ? `Pulled ${finalRows.length} unique reviewed assignments from Google and ignored ${duplicateAssignmentCount} duplicate row${duplicateAssignmentCount === 1 ? "" : "s"}. Review the printable rosters before finalizing the session.`
          : `Pulled ${finalRows.length} reviewed assignments from Google. Review the printable rosters before finalizing the session.`,
      importedCount: finalRows.length,
      skippedCount: duplicateAssignmentCount,
      issueCount: 0,
      refreshedStudentMap: true,
      studentMapRowCount: refreshResult.studentMapRowCount,
      homeroomRowCount: refreshResult.homeroomRowCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not sync final rosters from Google.';

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

export async function finalizeImportedRosters(): Promise<SyncFinalRostersResult> {
  const user = await requireRole(['admin']);
  const supabase = createAdminClient();
  const { block } = await getActiveContext();
  if (!block) return { ok: false, message: 'No current session is configured.' };
  if ((block as any).status === 'finalized') return { ok: false, message: 'This session is already finalized.' };

  const { count, error: countError } = await supabase
    .from('final_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('block_id', block.id);
  if (countError) return { ok: false, message: `Could not check final rosters: ${countError.message}` };
  if (!count) return { ok: false, message: 'Pull reviewed rosters from Google before finalizing this session.' };

  try {
    await createOrRefreshHistorySnapshot({ supabase, block, userId: user.id });
    const update = await supabase.from('blocks').update({
      status: 'finalized',
      matching_locked: true,
      teacher_offerings_open: false,
      student_form_open: false,
      public_club_submission_open: false,
      finalized_at: new Date().toISOString(),
    }).eq('id', block.id);
    if (update.error) return { ok: false, message: `Fairness history was saved, but the session could not be finalized: ${update.error.message}` };
    return { ok: true, message: `Finalized this session with ${count} final assignment${count === 1 ? '' : 's'}. Fairness history is ready for future matching.`, importedCount: count };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not finalize this session.' };
  }
}
