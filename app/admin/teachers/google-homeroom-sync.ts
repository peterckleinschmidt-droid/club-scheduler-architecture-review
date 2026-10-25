import { createAdminClient } from '@/lib/supabase/admin';

type GoogleHomeroomRow = {
  homeroom_code: string;
  homeroom_name: string;
  notes: string;
  active: boolean;
};

export type HomeroomSyncStatus = {
  ok: boolean;
  message: string;
  checked: boolean;
  pulledFromGoogle: boolean;
  pushedToGoogle: boolean;
  homeroomCount?: number;
};

function sheetNameForRange(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function rangeForSheet(name: string, range: string) {
  return `${sheetNameForRange(name)}!${range}`;
}

function parseActive(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized) return true;

  return ['true', 'yes', 'y', '1', 'active', 'included'].includes(normalized);
}

function normalizeHomeroomCode(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase();
}

function cleanName(value: string | null | undefined) {
  return String(value ?? '').trim();
}

function randomHomeroomCode() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `HR-${random}`;
}

async function googleFetch({
  accessToken,
  url,
  method,
  body,
}: {
  accessToken: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT';
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
  })) as {
    values?: string[][];
  };
}

async function clearSheetRange({
  accessToken,
  spreadsheetId,
  range,
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
}) {
  await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
    method: 'POST',
    body: {
      ranges: [range],
    },
  });
}

async function writeSheetValues({
  accessToken,
  spreadsheetId,
  range,
  values,
}: {
  accessToken: string;
  spreadsheetId: string;
  range: string;
  values: unknown[][];
}) {
  await googleFetch({
    accessToken,
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}?valueInputOption=RAW`,
    method: 'PUT',
    body: {
      values,
    },
  });
}

export async function getYearSetupWorkbookId({
  schoolYearId,
}: {
  schoolYearId: string;
}) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('google_year_workspace_links')
    .select('google_year_setup_workbook_id')
    .eq('school_year_id', schoolYearId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      message: error.message,
      workbookId: null as string | null,
    };
  }

  return {
    ok: Boolean(data?.google_year_setup_workbook_id),
    message: data?.google_year_setup_workbook_id
      ? 'Year setup workbook found.'
      : 'No year setup workbook has been created yet.',
    workbookId: data?.google_year_setup_workbook_id ?? null,
  };
}

export async function readGoogleHomerooms({
  accessToken,
  workbookId,
}: {
  accessToken: string;
  workbookId: string;
}) {
  const response = await readSheetValues({
    accessToken,
    spreadsheetId: workbookId,
    range: rangeForSheet('Homerooms', 'A:D'),
  });

  const rows = response.values ?? [];

  if (rows.length < 2) {
    return [] as GoogleHomeroomRow[];
  }

  return rows
    .slice(1)
    .map((row) => ({
      homeroom_code: normalizeHomeroomCode(row[0]),
      homeroom_name: cleanName(row[1]),
      notes: cleanName(row[2]),
      active: parseActive(row[3]),
    }))
    .filter((row) => row.homeroom_code && row.homeroom_name);
}

export async function pullGoogleHomeroomsIntoScheduler({
  accessToken,
  schoolYearId,
}: {
  accessToken: string;
  schoolYearId: string;
}): Promise<HomeroomSyncStatus> {
  const workbook = await getYearSetupWorkbookId({
    schoolYearId,
  });

  if (!workbook.ok || !workbook.workbookId) {
    return {
      ok: false,
      checked: true,
      pulledFromGoogle: false,
      pushedToGoogle: false,
      message: workbook.message,
    };
  }

  const admin = createAdminClient();
  const rows = await readGoogleHomerooms({
    accessToken,
    workbookId: workbook.workbookId,
  });

  if (rows.length === 0) {
    return {
      ok: true,
      checked: true,
      pulledFromGoogle: true,
      pushedToGoogle: false,
      homeroomCount: 0,
      message: 'Google homeroom list is empty.',
    };
  }

  for (const row of rows) {
    const { data: existing, error: existingError } = await admin
      .from('teachers')
      .select('id')
      .eq('homeroom_code', row.homeroom_code)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Could not check homeroom ${row.homeroom_code}: ${existingError.message}`);
    }

    if (existing?.id) {
      const { error: updateError } = await admin
        .from('teachers')
        .update({
          teacher_name: row.homeroom_name,
          is_active: row.active,
        })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Could not update homeroom ${row.homeroom_name}: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await admin.from('teachers').insert({
        teacher_name: row.homeroom_name,
        homeroom_code: row.homeroom_code,
        sort_order: 0,
        is_active: row.active,
      });

      if (insertError) {
        throw new Error(`Could not add homeroom ${row.homeroom_name}: ${insertError.message}`);
      }
    }
  }

  return {
    ok: true,
    checked: true,
    pulledFromGoogle: true,
    pushedToGoogle: false,
    homeroomCount: rows.length,
    message: `Updated Scheduler from ${rows.length} Google homerooms.`,
  };
}

export async function pushSchedulerHomeroomsToGoogle({
  accessToken,
  schoolYearId,
}: {
  accessToken: string;
  schoolYearId: string;
}): Promise<HomeroomSyncStatus> {
  const workbook = await getYearSetupWorkbookId({
    schoolYearId,
  });

  if (!workbook.ok || !workbook.workbookId) {
    return {
      ok: false,
      checked: true,
      pulledFromGoogle: false,
      pushedToGoogle: false,
      message: workbook.message,
    };
  }

  const admin = createAdminClient();

  const { data: teachers, error } = await admin
    .from('teachers')
    .select('id, teacher_name, homeroom_code, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('teacher_name', { ascending: true });

  if (error) {
    throw new Error(`Could not load homerooms from Scheduler: ${error.message}`);
  }

  const teacherRows = teachers ?? [];

  for (const teacher of teacherRows as any[]) {
    if (teacher.homeroom_code) continue;

    let code = randomHomeroomCode();
    let attempts = 0;

    while (attempts < 5) {
      const { data: existing } = await admin
        .from('teachers')
        .select('id')
        .eq('homeroom_code', code)
        .maybeSingle();

      if (!existing?.id) break;

      code = randomHomeroomCode();
      attempts += 1;
    }

    const { error: updateCodeError } = await admin
      .from('teachers')
      .update({ homeroom_code: code })
      .eq('id', teacher.id);

    if (updateCodeError) {
      throw new Error(`Could not assign a homeroom code: ${updateCodeError.message}`);
    }

    teacher.homeroom_code = code;
  }

  const values = [
    ['homeroom_code', 'homeroom_name', 'notes', 'active'],
    ...(teacherRows as any[]).map((teacher) => [
      teacher.homeroom_code,
      teacher.teacher_name,
      '',
      teacher.is_active === false ? 'FALSE' : 'TRUE',
    ]),
  ];

  await clearSheetRange({
    accessToken,
    spreadsheetId: workbook.workbookId,
    range: rangeForSheet('Homerooms', 'A:D'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: workbook.workbookId,
    range: rangeForSheet('Homerooms', 'A1'),
    values,
  });

  return {
    ok: true,
    checked: true,
    pulledFromGoogle: false,
    pushedToGoogle: true,
    homeroomCount: teacherRows.length,
    message: `Updated ${teacherRows.length} homerooms in Google.`,
  };
}