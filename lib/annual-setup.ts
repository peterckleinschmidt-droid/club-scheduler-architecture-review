import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AnnualSetupStatus = {
  yearId: string | null;
  googleConnected: boolean;
  hasYearWorkspace: boolean;
  activeHomeroomCount: number;
  sessionCount: number;
  annualSetupComplete: boolean;
  message: string;
};

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export async function getAnnualSetupStatusForActiveYear(): Promise<AnnualSetupStatus> {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: year } = await admin.from('school_years').select('id').eq('is_active', true).maybeSingle();
  if (!year?.id) {
    return { yearId: null, googleConnected: false, hasYearWorkspace: false, activeHomeroomCount: 0, sessionCount: 0, annualSetupComplete: false, message: 'Create the school year first.' };
  }

  const [workspaceResult, homeroomResult, sessionResult, authResult] = await Promise.all([
    admin.from('google_year_workspace_links').select('google_year_setup_workbook_id').eq('school_year_id', year.id).maybeSingle(),
    admin.from('teachers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('blocks').select('id', { count: 'exact', head: true }).eq('school_year_id', year.id),
    supabase.auth.getSession(),
  ]);

  const workbookId = workspaceResult.data?.google_year_setup_workbook_id ?? '';
  const accessToken = authResult.data.session?.provider_token ?? '';
  const activeHomeroomCount = homeroomResult.count ?? 0;
  const sessionCount = sessionResult.count ?? 0;
  const base = { yearId: year.id, googleConnected: Boolean(accessToken), hasYearWorkspace: Boolean(workbookId), activeHomeroomCount, sessionCount };

  if (!accessToken) return { ...base, annualSetupComplete: false, message: 'Connect Google to continue.' };
  if (!workbookId) return { ...base, annualSetupComplete: false, message: 'Prepare the year workbook.' };
  if (activeHomeroomCount < 1) return { ...base, annualSetupComplete: false, message: 'Add and review at least one homeroom.' };

  try {
    const range = encodeURIComponent("'Settings'!A:B");
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${workbookId}/values/${range}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return { ...base, annualSetupComplete: false, message: 'Confirm and update the Google homeroom list.' };
    const json = await response.json();
    const settings = new Map<string, string>((json.values ?? []).map((row: unknown[]) => [normalize(row[0]), String(row[1] ?? '').trim()]));
    const reviewed = normalize(settings.get('annual_setup_homerooms_reviewed')) === 'true';
    const synced = normalize(settings.get('annual_setup_homerooms_synced')) === 'true';
    const syncedCount = Number(settings.get('annual_setup_homeroom_count') ?? 0);
    const annualSetupComplete = reviewed && synced && syncedCount === activeHomeroomCount;
    return { ...base, annualSetupComplete, message: annualSetupComplete ? 'Annual setup is complete.' : 'Confirm and update the Google homeroom list.' };
  } catch {
    return { ...base, annualSetupComplete: false, message: 'Confirm and update the Google homeroom list.' };
  }
}
