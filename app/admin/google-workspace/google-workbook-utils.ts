import { createAdminClient } from '@/lib/supabase/admin';

type SheetValuesResponse = {
  range?: string;
  majorDimension?: string;
  values?: string[][];
};

type WorkspaceIds = {
  yearWorkbookId: string;
  blockWorkbookId: string;
};

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

export function sheetNameForRange(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

export function rangeForSheet(name: string, range: string) {
  return `${sheetNameForRange(name)}!${range}`;
}

export async function googleJsonFetch({
  accessToken,
  url,
  method,
  body,
}: {
  accessToken: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
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

export async function readSheetValues({
  accessToken,
  spreadsheetId,
  range,
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}) {
  return (await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}`,
    method: 'GET',
  })) as SheetValuesResponse;
}

export async function clearSheetRange({
  accessToken,
  spreadsheetId,
  range,
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}) {
  await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    method: 'POST',
    body: {
      ranges: [range],
    },
  });
}

export async function writeSheetValues({
  accessToken,
  spreadsheetId,
  range,
  values,
  valueInputOption = 'RAW',
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  values: unknown[][];
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}) {
  await googleJsonFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}?valueInputOption=${valueInputOption}`,
    method: 'PUT',
    body: {
      values,
    },
  });
}

function nonEmptyOrDefault(values: string[][] | undefined, fallback: string[][]) {
  if (!values || values.length === 0) {
    return fallback;
  }

  if (!values.some((row) => row.some((cell) => String(cell ?? '').trim()))) {
    return fallback;
  }

  return values;
}

export async function getGoogleWorkspaceIdsForBlock({
  schoolYearId,
  blockId,
}: {
  schoolYearId: string;
  blockId: string;
}): Promise<{
  ok: boolean;
  message?: string;
  ids?: WorkspaceIds;
}> {
  const admin = createAdminClient();

  const { data: yearWorkspace, error: yearWorkspaceError } = await admin
    .from('google_year_workspace_links')
    .select('google_year_setup_workbook_id')
    .eq('school_year_id', schoolYearId)
    .maybeSingle();

  if (yearWorkspaceError) {
    return {
      ok: false,
      message: `Could not load the year workspace: ${yearWorkspaceError.message}`,
    };
  }

  if (!yearWorkspace?.google_year_setup_workbook_id) {
    return {
      ok: false,
      message: 'No year setup workbook is saved yet. Create the year workspace first.',
    };
  }

  const { data: blockWorkspace, error: blockWorkspaceError } = await admin
    .from('google_workspace_links')
    .select('google_setup_workbook_id')
    .eq('school_year_id', schoolYearId)
    .eq('block_id', blockId)
    .maybeSingle();

  if (blockWorkspaceError) {
    return {
      ok: false,
      message: `Could not load the session workspace: ${blockWorkspaceError.message}`,
    };
  }

  if (!blockWorkspace?.google_setup_workbook_id) {
    return {
      ok: false,
      message: 'No session workbook is saved yet. Create the session workspace first.',
    };
  }

  return {
    ok: true,
    ids: {
      yearWorkbookId: yearWorkspace.google_year_setup_workbook_id,
      blockWorkbookId: blockWorkspace.google_setup_workbook_id,
    },
  };
}

export async function refreshBlockWorkbookFromYearSetup({
  accessToken,
  yearWorkbookId,
  blockWorkbookId,
}: {
  accessToken: string;
  yearWorkbookId: string;
  blockWorkbookId: string;
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

  const homeroomValues = nonEmptyOrDefault(
    homeroomsResponse.values,
    DEFAULT_HOMEROOM_HEADERS
  );

  const studentMapValues = nonEmptyOrDefault(
    studentMapResponse.values,
    DEFAULT_STUDENT_MAP_HEADERS
  );

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Homerooms', 'A:D'),
  });

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Student Map', 'A:I'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Homerooms', 'A1'),
    values: homeroomValues,
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet('Student Map', 'A1'),
    values: studentMapValues,
  });

  return {
    homeroomRowCount: Math.max(0, homeroomValues.length - 1),
    studentMapRowCount: Math.max(0, studentMapValues.length - 1),
  };
}