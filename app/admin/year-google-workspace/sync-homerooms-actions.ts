'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type SyncHomeroomsResult = { ok: boolean; message: string; homeroomCount?: number };
type TeacherRow = { id: string; teacher_name: string; homeroom_code: string | null; is_active: boolean | null; sort_order: number | null };

const HOMEROOMS_TAB = 'Homerooms';
const SETTINGS_TAB = 'Settings';

function googlePermissionMessage() {
  return ['Google is not connected with Sheets access yet.', 'Click Connect Google, approve the requested permissions, then try again.'].join(' ');
}
function sheetNameForRange(name: string) { return `'${name.replace(/'/g, "''")}'`; }
function rangeForSheet(name: string, range: string) { return `${sheetNameForRange(name)}!${range}`; }
function fallbackHomeroomCode(teacherId: string) {
  const cleanId = String(teacherId ?? '').trim();
  return cleanId ? `HR-${cleanId.split('-')[0].toUpperCase()}` : 'HR-UNKNOWN';
}
async function googleFetch({ accessToken, url, method, body }: { accessToken: string; url: string; method: 'POST' | 'PUT'; body?: unknown }) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(json?.error?.message ?? json?.message ?? `Google request failed with status ${response.status}.`);
  return json;
}
async function clearSheetRange({ accessToken, spreadsheetId, range }: { accessToken: string; spreadsheetId: string; range: string }) {
  await googleFetch({ accessToken, url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, method: 'POST', body: { ranges: [range] } });
}
async function writeSheetValues({ accessToken, spreadsheetId, range, values }: { accessToken: string; spreadsheetId: string; range: string; values: unknown[][] }) {
  await googleFetch({ accessToken, url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, method: 'PUT', body: { values } });
}

export async function syncHomeroomsToYearGoogle(): Promise<SyncHomeroomsResult> {
  await requireRole(['admin']);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { year } = await getActiveContext();
  if (!year) return { ok: false, message: 'No active school year is configured.' };

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { ok: false, message: `Could not check your Google connection: ${sessionError.message}` };
  const providerToken = session?.provider_token;
  if (!providerToken) return { ok: false, message: googlePermissionMessage() };

  const { data: yearWorkspace, error: yearWorkspaceError } = await admin.from('google_year_workspace_links').select('google_year_setup_workbook_id').eq('school_year_id', year.id).maybeSingle();
  if (yearWorkspaceError) return { ok: false, message: `Could not load the year workspace: ${yearWorkspaceError.message}` };
  if (!yearWorkspace?.google_year_setup_workbook_id) return { ok: false, message: 'No year setup workbook is saved yet. Create the year workspace first.' };

  const { data: teachers, error: teachersError } = await admin.from('teachers').select('id, teacher_name, homeroom_code, is_active, sort_order').eq('is_active', true).order('sort_order', { ascending: true }).order('teacher_name', { ascending: true });
  if (teachersError) return { ok: false, message: `Could not load homerooms from Scheduler: ${teachersError.message}` };
  const teacherRows = (teachers ?? []) as TeacherRow[];
  if (!teacherRows.length) return { ok: false, message: 'Add at least one active homeroom in Scheduler before updating Google.' };

  const values = [['homeroom_code', 'homeroom_name', 'notes', 'active'], ...teacherRows.map((teacher) => [teacher.homeroom_code || fallbackHomeroomCode(teacher.id), teacher.teacher_name, '', 'TRUE'])];
  const settings = [
    ['annual_setup_homerooms_reviewed', 'TRUE'],
    ['annual_setup_homerooms_synced', 'TRUE'],
    ['annual_setup_homerooms_synced_at', new Date().toISOString()],
    ['annual_setup_homeroom_count', String(teacherRows.length)],
  ];

  try {
    await clearSheetRange({ accessToken: providerToken, spreadsheetId: yearWorkspace.google_year_setup_workbook_id, range: rangeForSheet(HOMEROOMS_TAB, 'A:D') });
    await writeSheetValues({ accessToken: providerToken, spreadsheetId: yearWorkspace.google_year_setup_workbook_id, range: rangeForSheet(HOMEROOMS_TAB, 'A1'), values });
    await clearSheetRange({ accessToken: providerToken, spreadsheetId: yearWorkspace.google_year_setup_workbook_id, range: rangeForSheet(SETTINGS_TAB, 'A7:B10') });
    await writeSheetValues({ accessToken: providerToken, spreadsheetId: yearWorkspace.google_year_setup_workbook_id, range: rangeForSheet(SETTINGS_TAB, 'A7'), values: settings });
    return { ok: true, message: `Confirmed and updated ${teacherRows.length} homerooms in the year setup workbook. Annual setup is ready for the first session.`, homeroomCount: teacherRows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update homerooms in Google.';
    if (['permission', 'scope', 'access', 'unauthorized'].some((term) => message.toLowerCase().includes(term))) {
      return { ok: false, message: `${message} Try Connect Google again.` };
    }
    return { ok: false, message };
  }
}
