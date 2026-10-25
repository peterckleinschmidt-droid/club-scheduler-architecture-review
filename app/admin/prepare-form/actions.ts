'use server';

import { requireRole, getActiveContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateGoogleForm } from './google-form-generator-kid-friendly';
import {
  getGoogleWorkspaceIdsForBlock,
  rangeForSheet,
  refreshBlockWorkbookFromYearSetup,
  writeSheetValues,
} from '../google-workspace/google-workbook-utils';
import { refreshBlockClubColumnsFromScheduler } from '../google-workspace/google-club-sync';

type GenerateFormResult = {
  ok: boolean;
  message: string;
  formId?: string;
  editUrl?: string;
  responderUrl?: string;
};

type ClubForForm = {
  club_title: string;
  section_label: string | null;
  description: string | null;
  club_title_es?: string | null;
  section_label_es?: string | null;
  description_es?: string | null;
  spanish_translation_ready?: boolean | null;
  grade_limited: boolean | null;
  eligible_grade: number | null;
  eligible_grades?: number[] | string[] | null;
};

type TeacherForForm = {
  teacher_name: string;
};

type WorkspaceLink = {
  id: string;
  google_block_folder_id: string | null;
  google_student_form_id: string | null;
  google_student_form_edit_url: string | null;
  google_student_form_responder_url: string | null;
};

function googlePermissionMessage() {
  return [
    'Google Forms is not connected yet.',
    'Click Connect Google, approve the requested permissions, then try creating the form again.',
  ].join(' ');
}

function googleWorkspaceMessage() {
  return [
    'Google workspace has not been created yet.',
    'Go to Session Workspace, create the Drive folder and workbook for this session, then try creating the form again.',
  ].join(' ');
}

function isPermissionProblem(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('insufficient') ||
    normalized.includes('permission') ||
    normalized.includes('scope') ||
    normalized.includes('access') ||
    normalized.includes('unauthorized')
  );
}

async function enableVerifiedEmailCollection({
  accessToken,
  formId,
}: {
  accessToken: string;
  formId: string;
}) {
  const response = await fetch(
    `https://forms.googleapis.com/v1/forms/${formId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            updateSettings: {
              settings: {
                emailCollectionType: 'VERIFIED',
              },
              updateMask: 'emailCollectionType',
            },
          },
        ],
      }),
    }
  );

  const responseText = await response.text();
  const responseJson = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const message =
      responseJson?.error?.message ??
      responseJson?.message ??
      `Google could not enable verified email collection (status ${response.status}).`;
    throw new Error(message);
  }
}

export async function createGoogleFormForCurrentBlock(): Promise<GenerateFormResult> {
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

  const { data: workspaceLink, error: workspaceError } = await admin
    .from('google_workspace_links')
    .select(
      'id, google_block_folder_id, google_student_form_id, google_student_form_edit_url, google_student_form_responder_url'
    )
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (workspaceError) {
    return {
      ok: false,
      message: `Could not check the Google workspace for this session: ${workspaceError.message}`,
    };
  }

  const workspace = (workspaceLink ?? null) as WorkspaceLink | null;

  if (!workspace?.google_block_folder_id) {
    return {
      ok: false,
      message: googleWorkspaceMessage(),
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

  if (
    workspace.google_student_form_id &&
    workspace.google_student_form_edit_url &&
    workspace.google_student_form_responder_url
  ) {
    try {
      await writeSheetValues({
        accessToken: providerToken,
        spreadsheetId: workspaceIds.ids.blockWorkbookId,
        range: rangeForSheet('Settings', 'A10:B13'),
        values: [
          ['google_student_form_id', workspace.google_student_form_id],
          ['google_student_form_edit_url', workspace.google_student_form_edit_url],
          ['google_student_form_responder_url', workspace.google_student_form_responder_url],
        ],
        valueInputOption: 'RAW',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Google Sheets error.';
      return {
        ok: false,
        message:
          'The Google Form is saved, but its information could not be added ' +
          'to the session workbook: ' + message,
      };
    }

    return {
      ok: true,
      message:
        'The existing Google Form is ready. Its connection information was added to the session workbook.',
      formId: workspace.google_student_form_id,
      editUrl: workspace.google_student_form_edit_url,
      responderUrl: workspace.google_student_form_responder_url,
    };
  }

  const [{ data: teachers, error: teachersError }, { data: clubs, error: clubsError }] =
    await Promise.all([
      admin
        .from('teachers')
        .select('teacher_name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('teacher_name', { ascending: true }),
      admin
        .from('club_offerings')
        .select(
          'club_title, section_label, description, club_title_es, section_label_es, description_es, spanish_translation_ready, grade_limited, eligible_grade, eligible_grades'
        )
        .eq('block_id', block.id)
        .eq('is_active', true)
        .eq('show_to_students', true)
        .order('club_title'),
    ]);

  if (teachersError) {
    return {
      ok: false,
      message: `Could not load homerooms: ${teachersError.message}`,
    };
  }

  if (clubsError) {
    return {
      ok: false,
      message: `Could not load clubs: ${clubsError.message}`,
    };
  }

  const teacherRows = (teachers ?? []) as TeacherForForm[];
  const clubRows = (clubs ?? []) as ClubForForm[];

  if (teacherRows.length === 0) {
    return {
      ok: false,
      message: 'Add at least one active homeroom before creating the form.',
    };
  }

  if (clubRows.length === 0) {
    return {
      ok: false,
      message: 'Add at least one active club before creating the form.',
    };
  }

  try {
    await refreshBlockWorkbookFromYearSetup({
      accessToken: providerToken,
      yearWorkbookId: workspaceIds.ids.yearWorkbookId,
      blockWorkbookId: workspaceIds.ids.blockWorkbookId,
    });

    await refreshBlockClubColumnsFromScheduler({
      accessToken: providerToken,
      blockWorkbookId: workspaceIds.ids.blockWorkbookId,
      blockId: block.id,
    });

    const created = await generateGoogleForm({
      accessToken: providerToken,
      schoolYearLabel: year.label,
      blockLabel: block.label,
      teachers: teacherRows,
      clubs: clubRows,
      targetFolderId: workspace.google_block_folder_id,
    });

    await enableVerifiedEmailCollection({
      accessToken: providerToken,
      formId: created.formId,
    });

    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspaceIds.ids.blockWorkbookId,
      range: rangeForSheet('Settings', 'A10:B13'),
      values: [
        ['google_student_form_id', created.formId],
        ['google_student_form_edit_url', created.editUrl],
        ['google_student_form_responder_url', created.responderUrl],
        ['google_year_setup_workbook_id', workspaceIds.ids.yearWorkbookId],
      ],
      valueInputOption: 'RAW',
    });

    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from('google_workspace_links')
      .update({
        google_student_form_id: created.formId,
        google_student_form_edit_url: created.editUrl,
        google_student_form_responder_url: created.responderUrl,
        updated_at: now,
      })
      .eq('school_year_id', year.id)
      .eq('block_id', block.id);

    if (updateError) {
      return {
        ok: true,
        message:
          'Google Form was created, but Scheduler could not save the form link. Copy the link from Google Drive if needed.',
        formId: created.formId,
        editUrl: created.editUrl,
        responderUrl: created.responderUrl,
      };
    }

    return {
      ok: true,
      message:
        'Google Form created with verified email collection and saved to this session workspace. The session workbook was also updated with the latest homerooms, student map, and club columns.',
      formId: created.formId,
      editUrl: created.editUrl,
      responderUrl: created.responderUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google could not create the form.';

    if (isPermissionProblem(message)) {
      return {
        ok: false,
        message: `${message} Try Connect Google Forms again. If this keeps happening, the district Google admin may need to approve this app for Google Forms, Drive, and Sheets access.`,
      };
    }

    return {
      ok: false,
      message,
    };
  }
}


export async function connectExistingGoogleFormToWorkbook(): Promise<{
  ok: boolean;
  message: string;
  workbookUrl?: string;
}> {
  await requireRole(['admin']);

  const supabase = await createClient();
  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'No active school year or current session is configured.' };
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return { ok: false, message: `Could not check your Google connection: ${sessionError.message}` };
  }

  const providerToken = session?.provider_token;
  if (!providerToken) {
    return { ok: false, message: googlePermissionMessage() };
  }

  const { data: workspace, error: workspaceError } = await admin
    .from('google_workspace_links')
    .select(
      'google_setup_workbook_id, google_setup_workbook_url, google_student_form_id, google_student_form_edit_url, google_student_form_responder_url'
    )
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (workspaceError) {
    return { ok: false, message: `Could not load the saved Google form: ${workspaceError.message}` };
  }

  if (!workspace?.google_setup_workbook_id || !workspace?.google_setup_workbook_url) {
    return { ok: false, message: 'Create the session Google workbook before connecting form responses.' };
  }

  if (
    !workspace.google_student_form_id ||
    !workspace.google_student_form_edit_url ||
    !workspace.google_student_form_responder_url
  ) {
    return {
      ok: false,
      message: 'No existing Google Form is saved for this session. Create the form first.',
    };
  }

  try {
    await writeSheetValues({
      accessToken: providerToken,
      spreadsheetId: workspace.google_setup_workbook_id,
      range: rangeForSheet('Settings', 'A10:B13'),
      values: [
        ['google_student_form_id', workspace.google_student_form_id],
        ['google_student_form_edit_url', workspace.google_student_form_edit_url],
        ['google_student_form_responder_url', workspace.google_student_form_responder_url],
      ],
      valueInputOption: 'RAW',
    });

    return {
      ok: true,
      message:
        'The existing form was preserved. Its connection information was added to the session workbook. Open the workbook, reload it, and choose Club Scheduler > Connect student form responses.',
      workbookUrl: workspace.google_setup_workbook_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Google Sheets error.';
    return {
      ok: false,
      message: `The existing form was not changed, but its connection information could not be added to the session workbook: ${message}`,
    };
  }
}

