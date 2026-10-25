"use server";

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { commitImportChoices } from '../import-choices/actions';
import {
  getGoogleWorkspaceIdsForBlock,
  readSheetValues,
  rangeForSheet,
  refreshBlockWorkbookFromYearSetup,
} from './google-workbook-utils';

type SyncCodedChoicesResult = {
  ok: boolean;
  message: string;
  importedCount?: number;
  createdStudentCount?: number;
  issueCount?: number;
  refreshedStudentMap?: boolean;
  studentMapRowCount?: number;
  homeroomRowCount?: number;
  refreshedClubColumns?: boolean;
  clubColumnCount?: number;
};

type SheetValuesResponse = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
};

type ImportIssueLike = {
  severity?: unknown;
  row?: unknown;
  rowNumber?: unknown;
  line?: unknown;
  index?: unknown;
  field?: unknown;
  column?: unknown;
  header?: unknown;
  message?: unknown;
  issue?: unknown;
  error?: unknown;
  reason?: unknown;
};

const CODED_CHOICES_TAB = 'Coded Choices Export';
const HEADER_RENAMES: Record<string, string> = {
  student_code: 'Student Code',
  studentcode: 'Student Code',
  'student code': 'Student Code',
  grade: 'Grade',
  homeroom_code: 'Homeroom Code',
  homeroomcode: 'Homeroom Code',
  'homeroom code': 'Homeroom Code',
  max_clubs: 'Max Clubs',
  maxclubs: 'Max Clubs',
  'max clubs': 'Max Clubs',
  top_choice: 'Top Choice',
  topchoice: 'Top Choice',
  'top choice': 'Top Choice',
};

function normalizeHeader(value: string) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function displayHeader(value: string) {
  const normalized = normalizeHeader(value);
  return HEADER_RENAMES[normalized] ?? String(value ?? '').trim();
}

function csvEscape(value: string) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => csvEscape(cell)).join(','))
    .join('\n');
}

function trimEmptyRows(rows: string[][]) {
  return rows.filter((row) => row.some((cell) => String(cell ?? '').trim()));
}

function googlePermissionMessage() {
  return [
    'Google is not connected with Sheets access yet.',
    'Click Connect Google, approve the requested permissions, then try again.',
  ].join(' ');
}

function issueRecord(issue: unknown): ImportIssueLike | null {
  return issue && typeof issue === 'object' ? (issue as ImportIssueLike) : null;
}

function issueSeverity(issue: unknown): 'error' | 'warning' {
  const severity = String(issueRecord(issue)?.severity ?? '').toLowerCase();
  return severity === 'warning' ? 'warning' : 'error';
}

function issueToText(issue: unknown) {
  if (typeof issue === 'string') return issue;
  const record = issueRecord(issue);
  if (record) {
    const row = record.row ?? record.rowNumber ?? record.line ?? record.index;
    const field = record.field ?? record.column ?? record.header;
    const message = record.message ?? record.issue ?? record.error ?? record.reason;
    const parts = [
      row !== undefined ? `row ${row}` : null,
      field !== undefined ? `field ${String(field)}` : null,
      message !== undefined ? String(message) : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(': ');
    try {
      return JSON.stringify(issue);
    } catch {
      return String(issue);
    }
  }
  return String(issue);
}

function summarizeIssues(issues: unknown[]) {
  if (issues.length === 0) return '';

  const errors = issues.filter((issue) => issueSeverity(issue) === 'error');
  const warnings = issues.filter((issue) => issueSeverity(issue) === 'warning');
  const ordered = [...errors, ...warnings];
  const details = ordered
    .slice(0, 10)
    .map((issue, index) => `${index + 1}. ${issueToText(issue)}`)
    .join(' ');
  const hiddenCount = Math.max(0, ordered.length - 10);

  return [
    `Blocking problems: ${errors.length}.`,
    `Automatic corrections and warnings: ${warnings.length}.`,
    details,
    hiddenCount > 0
      ? `${hiddenCount} additional issue(s) are not shown in this summary.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function summarizeSheetShape(rows: string[][]) {
  const header = rows[0] ?? [];
  const sampleStudentCodes = rows
    .slice(1, 6)
    .map((row) => String(row[0] ?? '').trim())
    .filter(Boolean)
    .join(', ');
  return [
    `Rows read from Google: ${Math.max(0, rows.length - 1)}.`,
    `Columns read from Google: ${header.length}.`,
    sampleStudentCodes ? `Sample student codes: ${sampleStudentCodes}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export async function syncCodedChoicesFromGoogle(): Promise<SyncCodedChoicesResult> {
  await requireRole(['admin']);
  const supabase = await createClient();
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

  try {
    const refreshResult = await refreshBlockWorkbookFromYearSetup({
      accessToken: providerToken,
      yearWorkbookId: workspaceIds.ids.yearWorkbookId,
      blockWorkbookId: workspaceIds.ids.blockWorkbookId,
    });

    const sheetData = (await readSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet(CODED_CHOICES_TAB, 'A:ZZ'),
    })) as SheetValuesResponse;

    const rows = trimEmptyRows(sheetData.values ?? []);
    if (rows.length < 2) {
      return {
        ok: false,
        message:
          'No coded student choices were found. Add rows to the Coded Choices Export tab, then try again.',
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
        refreshedClubColumns: false,
        clubColumnCount: Math.max(0, (rows[0]?.length ?? 5) - 5),
      };
    }

    const headerRow = rows[0].map(displayHeader);
    const dataRows = rows.slice(1);
    const csvText = rowsToCsv([headerRow, ...dataRows]);
    const importResult = await commitImportChoices(csvText);
    const issues = importResult.issues as unknown[];

    if (!importResult.ok) {
      const issueSummary = summarizeIssues(issues);
      const sheetSummary = summarizeSheetShape(rows);
      return {
        ok: false,
        message:
          `Coded choices were read from Google, but at least one blocking problem remains. ` +
          `No responses were imported. ${sheetSummary} ${issueSummary}`,
        importedCount: importResult.importedCount,
        createdStudentCount: importResult.createdStudentCount,
        issueCount: importResult.issues.length,
        refreshedStudentMap: true,
        studentMapRowCount: refreshResult.studentMapRowCount,
        homeroomRowCount: refreshResult.homeroomRowCount,
        refreshedClubColumns: false,
        clubColumnCount: Math.max(0, (rows[0]?.length ?? 5) - 5),
      };
    }

    return {
      ok: true,
      message: `Imported ${importResult.importedCount} coded student responses from Google.`,
      importedCount: importResult.importedCount,
      createdStudentCount: importResult.createdStudentCount,
      issueCount: importResult.issues.length,
      refreshedStudentMap: true,
      studentMapRowCount: refreshResult.studentMapRowCount,
      homeroomRowCount: refreshResult.homeroomRowCount,
      refreshedClubColumns: false,
      clubColumnCount: Math.max(0, (rows[0]?.length ?? 5) - 5),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not sync coded choices from Google.';
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
