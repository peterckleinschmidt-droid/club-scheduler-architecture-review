'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { installRosterManagerScript } from './apps-script-installer';
import { rosterManagerScriptFiles } from './roster-manager-script-template';

type WorkspaceResult = {
  ok: boolean;
  message: string;
  rootFolderId?: string;
  yearFolderId?: string;
  blockFolderId?: string;
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

type SheetValuesResponse = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
};

type YearWorkspaceLink = {
  google_root_folder_id: string | null;
  google_year_folder_id: string | null;
  google_year_setup_workbook_id: string | null;
  google_year_setup_workbook_url: string | null;
};

const WORKBOOK_TABS = [
  'Start Here',
  'Settings',
  'Homerooms',
  'Student Map',
  'Form Responses',
  'Coded Choices Export',
  'Draft Coded Assignments',
  'Draft Named Rosters',
  'Final Named Rosters',
  'Final Coded Assignments',
];

const DEFAULT_HOMEROOM_HEADERS = [['homeroom_code', 'homeroom_name', 'notes', 'active']];

const DEFAULT_STUDENT_MAP_HEADERS = [
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
  method: 'GET' | 'POST' | 'PATCH' | 'PUT';
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

function schedulerWorkflowUrl() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    '';

  if (!configured.trim()) {
    throw new Error(
      'Scheduler URL is not configured. Set NEXT_PUBLIC_APP_URL to the deployed Scheduler base URL, then try again.'
    );
  }

  const withProtocol = /^https?:\/\//i.test(configured.trim())
    ? configured.trim()
    : `https://${configured.trim()}`;

  return `${withProtocol.replace(/\/$/, '')}/admin/workflow`;
}

async function saveSchedulerWorkflowUrl({
  accessToken,
  spreadsheetId,
  schedulerUrl,
}: {
  accessToken: string;
  spreadsheetId: string;
  schedulerUrl: string;
}) {
  const settingsRange = rangeForSheet('Settings', 'A:B');
  const settings = await readSheetValues({
    accessToken,
    spreadsheetId,
    range: settingsRange,
  });
  const rows = settings.values ?? [];
  const key = 'scheduler_workflow_url';
  const rowIndex = rows.findIndex(
    (row) => String(row[0] ?? '').trim().toLowerCase() === key
  );

  if (rowIndex >= 0) {
    const targetRange = rangeForSheet('Settings', `B${rowIndex + 1}`);
    await googleFetch({
      accessToken,
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        targetRange
      )}?valueInputOption=RAW`,
      method: 'PUT',
      body: {
        range: targetRange,
        majorDimension: 'ROWS',
        values: [[schedulerUrl]],
      },
    });
    return;
  }

  await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      settingsRange
    )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    body: {
      range: settingsRange,
      majorDimension: 'ROWS',
      values: [[key, schedulerUrl]],
    },
  });
}

async function readSheetValues({
  accessToken,
  spreadsheetId,
  range,
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}) {
  return (await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}`,
    method: 'GET',
  })) as SheetValuesResponse;
}

async function readYearWorkbookValues({
  accessToken,
  yearWorkbookId,
}: {
  accessToken: string;
  yearWorkbookId: string;
}) {
  const [homeroomsResponse, studentMapResponse] = await Promise.all([
    readSheetValues({
      accessToken,
      spreadsheetId: yearWorkbookId,
      range: rangeForSheet('Homerooms', 'A:D'),
    }),
    readSheetValues({
      accessToken,
      spreadsheetId: yearWorkbookId,
      range: rangeForSheet('Student Map', 'A:I'),
    }),
  ]);

  const homeroomValues =
    homeroomsResponse.values && homeroomsResponse.values.length > 0
      ? homeroomsResponse.values
      : DEFAULT_HOMEROOM_HEADERS;

  const studentMapValues =
    studentMapResponse.values && studentMapResponse.values.length > 0
      ? studentMapResponse.values
      : DEFAULT_STUDENT_MAP_HEADERS;

  return {
    homeroomValues,
    studentMapValues,
  };
}

async function setupWorkbookSheets({
  accessToken,
  spreadsheetId,
  homeroomValues,
  studentMapValues,
  year,
  block,
  schedulerUrl,
}: {
  accessToken: string;
  spreadsheetId: string;
  homeroomValues: string[][];
  studentMapValues: string[][];
  year: { label: string };
  block: { label: string };
  schedulerUrl: string;
}) {
  const properties = await getSpreadsheetProperties({
    accessToken,
    spreadsheetId,
  });

  const firstSheetId = properties.sheets?.[0]?.properties?.sheetId;

  if (firstSheetId === undefined) {
    throw new Error('Could not find the starter sheet in the new workbook.');
  }

  const batchRequests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: firstSheetId,
          title: 'Start Here',
        },
        fields: 'title',
      },
    },
    ...WORKBOOK_TABS.filter((tab) => tab !== 'Start Here').map((title) => ({
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
          range: rangeForSheet('Start Here', 'A1:B4'),
          values: [
            ['Club Scheduler', ''],
            ['Loading workbook tools...', ''],
            ['Open the Club Scheduler menu after the workbook finishes loading.', ''],
            ['', ''],
          ],
        },
        {
          range: rangeForSheet('Settings', 'A1:B12'),
          values: [
            ['setting', 'value'],
            ['workspace_version', '2'],
            ['workspace_type', 'block'],
            ['student_identity_location', 'Google Workspace only'],
            ['scheduler_import_tab', 'Coded Choices Export'],
            ['scheduler_draft_output_tab', 'Draft Coded Assignments'],
            ['scheduler_final_sync_tab', 'Final Coded Assignments'],
            ['student_map_source', 'copied from year setup workbook'],
            ['school_year_label', year.label],
            ['block_label', block.label],
            ['scheduler_workflow_url', schedulerUrl],
          ],
        },
        {
          range: rangeForSheet('Homerooms', 'A1'),
          values: homeroomValues,
        },
        {
          range: rangeForSheet('Student Map', 'A1'),
          values: studentMapValues,
        },
        {
          range: rangeForSheet('Form Responses', 'A1:A1'),
          values: [['Raw Google Form responses will appear in a linked response sheet or copied tab.']],
        },
        {
          range: rangeForSheet('Coded Choices Export', 'A1:E1'),
          values: [['student_code', 'grade', 'homeroom_code', 'max_clubs', 'top_choice']],
        },
        {
          range: rangeForSheet('Draft Coded Assignments', 'A1:F1'),
          values: [
            [
              'student_code',
              'club_title',
              'section_label',
              'assignment_order',
              'was_top_choice',
              'match_run_id',
            ],
          ],
        },
        {
          range: rangeForSheet('Draft Named Rosters', 'A1:G1'),
          values: [
            [
              'club_title',
              'section_label',
              'student_name',
              'grade',
              'homeroom_name',
              'student_code',
              'was_top_choice',
            ],
          ],
        },
        {
          range: rangeForSheet('Final Named Rosters', 'A1:G1'),
          values: [
            [
              'club_title',
              'section_label',
              'student_name',
              'grade',
              'homeroom_name',
              'student_code',
              'notes',
            ],
          ],
        },
        {
          range: rangeForSheet('Final Coded Assignments', 'A1:D1'),
          values: [['student_code', 'club_title', 'section_label', 'assignment_order']],
        },
      ],
    },
  });
}

export async function createGoogleWorkspaceForCurrentBlock(): Promise<WorkspaceResult> {
  const profile = await requireRole(['admin']);

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

  let schedulerUrl: string;
  try {
    schedulerUrl = schedulerWorkflowUrl();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Scheduler URL is not configured.',
    };
  }

  const { data: existingLink } = await admin
    .from('google_workspace_links')
    .select('*')
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (existingLink?.google_setup_workbook_id && existingLink?.google_setup_workbook_url) {
    try {
      await saveSchedulerWorkflowUrl({
        accessToken: providerToken,
        spreadsheetId: existingLink.google_setup_workbook_id,
        schedulerUrl,
      });
      await installRosterManagerScript({
        accessToken: providerToken,
        spreadsheetId: existingLink.google_setup_workbook_id,
        title: `${year.label} ${block.label} Club Scheduler`,
        files: rosterManagerScriptFiles.map((file) => ({ ...file })),
      });
    } catch (error) {
      return {
        ok: false,
        message:
          'The Google workspace exists, but its Scheduler link could not be repaired: ' +
          (error instanceof Error ? error.message : 'Unknown Google error.'),
      };
    }

    return {
      ok: true,
      message: 'Google workspace is ready. The Scheduler link and workbook tools were refreshed.',
      rootFolderId: existingLink.google_root_folder_id ?? undefined,
      yearFolderId: existingLink.google_year_folder_id ?? undefined,
      blockFolderId: existingLink.google_block_folder_id ?? undefined,
      workbookId: existingLink.google_setup_workbook_id,
      workbookUrl: existingLink.google_setup_workbook_url,
      folderUrl: existingLink.google_block_folder_id
        ? `https://drive.google.com/drive/folders/${existingLink.google_block_folder_id}`
        : undefined,
    };
  }

  const { data: yearWorkspaceData, error: yearWorkspaceError } = await admin
    .from('google_year_workspace_links')
    .select(
      'google_root_folder_id, google_year_folder_id, google_year_setup_workbook_id, google_year_setup_workbook_url'
    )
    .eq('school_year_id', year.id)
    .maybeSingle();

  if (yearWorkspaceError) {
    return {
      ok: false,
      message: `Could not load the Google year workspace: ${yearWorkspaceError.message}`,
    };
  }

  const yearWorkspace = (yearWorkspaceData ?? null) as YearWorkspaceLink | null;

  if (
    !yearWorkspace?.google_root_folder_id ||
    !yearWorkspace.google_year_folder_id ||
    !yearWorkspace.google_year_setup_workbook_id
  ) {
    return {
      ok: false,
      message:
        'Create the Google year workspace first. Then create the session workspace for this session.',
    };
  }

  try {
    const { homeroomValues, studentMapValues } = await readYearWorkbookValues({
      accessToken: providerToken,
      yearWorkbookId: yearWorkspace.google_year_setup_workbook_id,
    });

    const blockFolder = await createDriveFolder({
      accessToken: providerToken,
      name: block.label,
      parentId: yearWorkspace.google_year_folder_id,
    });

    if (!blockFolder.id) {
      throw new Error('Google did not return a session folder ID.');
    }

    const workbook = await createSpreadsheetInFolder({
      accessToken: providerToken,
      name: `${year.label} ${block.label} Scheduler Workbook`,
      folderId: blockFolder.id,
    });

    if (!workbook.id || !workbook.webViewLink) {
      throw new Error('Google did not return a workbook link.');
    }

    await setupWorkbookSheets({
      accessToken: providerToken,
      spreadsheetId: workbook.id,
      homeroomValues,
      studentMapValues,
      year,
      block,
      schedulerUrl,
    });

    await installRosterManagerScript({
      accessToken: providerToken,
      spreadsheetId: workbook.id,
      title: `${year.label} ${block.label} Club Scheduler`,
      files: rosterManagerScriptFiles.map((file) => ({ ...file })),
    });

    const now = new Date().toISOString();

    const { error: upsertError } = await admin.from('google_workspace_links').upsert(
      {
        school_year_id: year.id,
        block_id: block.id,
        google_root_folder_id: yearWorkspace.google_root_folder_id,
        google_year_folder_id: yearWorkspace.google_year_folder_id,
        google_block_folder_id: blockFolder.id,
        google_setup_workbook_id: workbook.id,
        google_setup_workbook_url: workbook.webViewLink,
        created_by_user_id: profile.id,
        updated_at: now,
      },
      {
        onConflict: 'school_year_id,block_id',
      }
    );

    if (upsertError) {
      throw new Error(
        `Workspace was created in Google, but could not be saved in Scheduler: ${upsertError.message}`
      );
    }

    return {
      ok: true,
      message: 'Google session workspace created with the Club Scheduler tools installed. Reload the workbook, then approve Google access the first time you use the Club Scheduler menu.',
      rootFolderId: yearWorkspace.google_root_folder_id,
      yearFolderId: yearWorkspace.google_year_folder_id,
      blockFolderId: blockFolder.id,
      workbookId: workbook.id,
      workbookUrl: workbook.webViewLink,
      folderUrl: `https://drive.google.com/drive/folders/${blockFolder.id}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not create Google workspace.';

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