'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type YearWorkspaceResult = {
  ok: boolean;
  message: string;
  rootFolderId?: string;
  yearFolderId?: string;
  workbookId?: string;
  workbookUrl?: string;
  folderUrl?: string;
};

type DriveFileResult = {
  id?: string;
  webViewLink?: string;
};

type SheetProperties = {
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
};

const YEAR_WORKBOOK_TABS = [
  'Instructions',
  'Settings',
  'Homerooms',
  'Student Map',
];

function googlePermissionMessage() {
  return [
    'Google Drive and Sheets are not connected yet.',
    'Click Connect Google, approve the requested permissions, then try again.',
  ].join(' ');
}

async function googleFetch({
  accessToken,
  url,
  method,
  body,
}: {
  accessToken: string;
  url: string;
  method: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      json?.error?.message ??
      json?.message ??
      `Google request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return json;
}

async function createDriveFolder({
  accessToken,
  name,
  parentId,
}: {
  accessToken: string;
  name: string;
  parentId?: string;
}) {
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentId) {
    body.parents = [parentId];
  }

  return (await googleFetch({
    accessToken,
    url: 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
    method: 'POST',
    body,
  })) as DriveFileResult;
}

async function createSpreadsheetInFolder({
  accessToken,
  name,
  folderId,
}: {
  accessToken: string;
  name: string;
  folderId: string;
}) {
  return (await googleFetch({
    accessToken,
    url: 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
    method: 'POST',
    body: {
      name,
      mimeType: 'application/vnd.google-apps.spreadsheet',
      parents: [folderId],
    },
  })) as DriveFileResult;
}

async function getSpreadsheetProperties({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}) {
  return (await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    method: 'GET',
  })) as SheetProperties;
}

function sheetNameForRange(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function rangeForSheet(name: string, range: string) {
  return `${sheetNameForRange(name)}!${range}`;
}

async function setupYearWorkbookSheets({
  accessToken,
  spreadsheetId,
}: {
  accessToken: string;
  spreadsheetId: string;
}) {
  const properties = await getSpreadsheetProperties({
    accessToken,
    spreadsheetId,
  });

  const firstSheetId = properties.sheets?.[0]?.properties?.sheetId;

  if (firstSheetId === undefined) {
    throw new Error('Could not find the starter sheet in the new year workbook.');
  }

  const batchRequests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: firstSheetId,
          title: 'Instructions',
        },
        fields: 'title',
      },
    },
    ...YEAR_WORKBOOK_TABS.filter((tab) => tab !== 'Instructions').map((title) => ({
      addSheet: {
        properties: {
          title,
        },
      },
    })),
  ];

  await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    method: 'POST',
    body: {
      requests: batchRequests,
    },
  });

  await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    method: 'POST',
    body: {
      valueInputOption: 'RAW',
      data: [
        {
          range: rangeForSheet('Instructions', 'A1:B14'),
          values: [
            ['School Club Scheduler year setup', ''],
            ['Purpose', 'This workbook is the year-level home for student identity and homeroom setup.'],
            ['Student Map', 'Stores student names, emails, homerooms, and stable student codes.'],
            ['Homerooms', 'Stores homeroom names and codes used across sessions.'],
            ['Session workbooks', 'Each session gets its own separate workbook.'],
            ['Student codes', 'Student codes should stay stable across the school year.'],
            ['Privacy boundary', 'Scheduler should use coded student IDs for matching.'],
            ['', ''],
            ['Important', 'Do not delete student_code values. They connect Google rosters to Scheduler history.'],
            ['Important', 'New students can be added during the year. The Student Map should grow over time.'],
          ],
        },
        {
          range: rangeForSheet('Settings', 'A1:B10'),
          values: [
            ['setting', 'value'],
            ['workspace_version', '1'],
            ['workspace_type', 'year'],
            ['student_identity_location', 'Google Workspace only'],
            ['student_code_scope', 'stable across this school year'],
            ['block_workbooks', 'created as sessions are added during the year'],
          ],
        },
        {
          range: rangeForSheet('Homerooms', 'A1:D1'),
          values: [['homeroom_code', 'homeroom_name', 'notes', 'active']],
        },
        {
          range: rangeForSheet('Student Map', 'A1:I1'),
          values: [
            [
              'student_code',
              'student_name',
              'student_email',
              'grade',
              'homeroom_code',
              'homeroom_name',
              'active',
              'first_seen_block',
              'last_seen_block',
            ],
          ],
        },
      ],
    },
  });
}

export async function createGoogleYearWorkspaceForActiveYear(): Promise<YearWorkspaceResult> {
  const profile = await requireRole(['admin']);

  const supabase = await createClient();
  const admin = createAdminClient();
  const { year } = await getActiveContext();

  if (!year) {
    return {
      ok: false,
      message: 'No active school year is configured.',
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

  const { data: existingLink } = await admin
    .from('google_year_workspace_links')
    .select('*')
    .eq('school_year_id', year.id)
    .maybeSingle();

  if (
    existingLink?.google_year_setup_workbook_id &&
    existingLink?.google_year_setup_workbook_url
  ) {
    return {
      ok: true,
      message: 'Google year workspace already exists.',
      rootFolderId: existingLink.google_root_folder_id ?? undefined,
      yearFolderId: existingLink.google_year_folder_id ?? undefined,
      workbookId: existingLink.google_year_setup_workbook_id,
      workbookUrl: existingLink.google_year_setup_workbook_url,
      folderUrl: existingLink.google_year_folder_id
        ? `https://drive.google.com/drive/folders/${existingLink.google_year_folder_id}`
        : undefined,
    };
  }

  try {
    const rootFolder = await createDriveFolder({
      accessToken: providerToken,
      name: 'School Club Scheduler',
    });

    if (!rootFolder.id) {
      throw new Error('Google did not return a root folder ID.');
    }

    const yearFolder = await createDriveFolder({
      accessToken: providerToken,
      name: year.label,
      parentId: rootFolder.id,
    });

    if (!yearFolder.id) {
      throw new Error('Google did not return a year folder ID.');
    }

    const workbook = await createSpreadsheetInFolder({
      accessToken: providerToken,
      name: `${year.label} Year Setup Workbook`,
      folderId: yearFolder.id,
    });

    if (!workbook.id || !workbook.webViewLink) {
      throw new Error('Google did not return a year setup workbook link.');
    }

    await setupYearWorkbookSheets({
      accessToken: providerToken,
      spreadsheetId: workbook.id,
    });

    const now = new Date().toISOString();

    const { error: upsertError } = await admin.from('google_year_workspace_links').upsert(
      {
        school_year_id: year.id,
        google_root_folder_id: rootFolder.id,
        google_year_folder_id: yearFolder.id,
        google_year_setup_workbook_id: workbook.id,
        google_year_setup_workbook_url: workbook.webViewLink,
        created_by_user_id: profile.id,
        updated_at: now,
      },
      {
        onConflict: 'school_year_id',
      }
    );

    if (upsertError) {
      throw new Error(
        `Year workspace was created in Google, but could not be saved in Scheduler: ${upsertError.message}`
      );
    }

    return {
      ok: true,
      message: 'Google year workspace created.',
      rootFolderId: rootFolder.id,
      yearFolderId: yearFolder.id,
      workbookId: workbook.id,
      workbookUrl: workbook.webViewLink,
      folderUrl: `https://drive.google.com/drive/folders/${yearFolder.id}`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not create Google year workspace.';

    if (
      message.toLowerCase().includes('insufficient') ||
      message.toLowerCase().includes('permission') ||
      message.toLowerCase().includes('scope') ||
      message.toLowerCase().includes('access')
    ) {
      return {
        ok: false,
        message: `${message} Try Connect Google again. If this keeps happening, the district Google admin may need to approve this app for Drive and Sheets access.`,
      };
    }

    return {
      ok: false,
      message,
    };
  }
}
