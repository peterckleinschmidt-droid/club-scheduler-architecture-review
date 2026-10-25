type ScriptApiFile = {
  name: string;
  type: 'SERVER_JS' | 'HTML' | 'JSON';
  source: string;
};

type ScriptProject = {
  scriptId?: string;
};

async function scriptApiRequest({
  accessToken,
  url,
  method,
  body,
}: {
  accessToken: string;
  url: string;
  method: 'POST' | 'PUT';
  body: unknown;
}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  const responseJson = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    const message =
      responseJson?.error?.message ??
      responseJson?.message ??
      `Google Apps Script request failed with status ${response.status}.`;

    if (response.status === 403 && String(message).toLowerCase().includes('apps script api')) {
      throw new Error(
        `${message} Enable the Google Apps Script API for the Google Cloud project used by Scheduler, reconnect Google, and try again.`
      );
    }

    throw new Error(message);
  }

  return responseJson;
}

export async function installRosterManagerScript({
  accessToken,
  spreadsheetId,
  title,
  files,
}: {
  accessToken: string;
  spreadsheetId: string;
  title: string;
  files: ScriptApiFile[];
}) {
  const project = (await scriptApiRequest({
    accessToken,
    url: 'https://script.googleapis.com/v1/projects',
    method: 'POST',
    body: {
      title,
      parentId: spreadsheetId,
    },
  })) as ScriptProject;

  if (!project.scriptId) {
    throw new Error('Google created the session workbook but did not return an Apps Script project ID.');
  }

  await scriptApiRequest({
    accessToken,
    url: `https://script.googleapis.com/v1/projects/${project.scriptId}/content`,
    method: 'PUT',
    body: { files },
  });

  return { scriptId: project.scriptId };
}
