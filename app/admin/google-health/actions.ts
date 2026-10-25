"use server";

import { getActiveContext, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type GoogleHealthResult = {
  ok: boolean;
  message: string;
  checkedAt: string;
  needsReconnect: boolean;
  yearWorkbookChecked: boolean;
  blockWorkbookChecked: boolean;
  details: string[];
};

async function googleGet({ accessToken, url }: { accessToken: string; url: string }) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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

function isReconnectProblem(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("expired") ||
    normalized.includes("invalid") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission") ||
    normalized.includes("scope") ||
    normalized.includes("access") ||
    normalized.includes("401") ||
    normalized.includes("403")
  );
}

export async function checkGoogleHealth(): Promise<GoogleHealthResult> {
  await requireRole(["admin"]);

  const checkedAt = new Date().toISOString();
  const supabase = await createClient();
  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    return {
      ok: false,
      message: `Could not check Google connection: ${sessionError.message}`,
      checkedAt,
      needsReconnect: true,
      yearWorkbookChecked: false,
      blockWorkbookChecked: false,
      details: [],
    };
  }

  const providerToken = session?.provider_token;

  if (!providerToken) {
    return {
      ok: false,
      message: "Google needs to be reconnected.",
      checkedAt,
      needsReconnect: true,
      yearWorkbookChecked: false,
      blockWorkbookChecked: false,
      details: ["No active Google permission token was found."],
    };
  }

  const details: string[] = [];
  let yearWorkbookChecked = false;
  let blockWorkbookChecked = false;

  try {
    await googleGet({
      accessToken: providerToken,
      url: "https://www.googleapis.com/oauth2/v3/userinfo",
    });

    details.push("Google account connection is working.");

    if (year?.id) {
      const { data: yearWorkspace, error: yearWorkspaceError } = await admin
        .from("google_year_workspace_links")
        .select("google_year_setup_workbook_id")
        .eq("school_year_id", year.id)
        .maybeSingle();

      if (yearWorkspaceError) {
        details.push(`Could not check year setup workbook: ${yearWorkspaceError.message}`);
      } else if (yearWorkspace?.google_year_setup_workbook_id) {
        await googleGet({
          accessToken: providerToken,
          url: `https://sheets.googleapis.com/v4/spreadsheets/${yearWorkspace.google_year_setup_workbook_id}?fields=spreadsheetId`,
        });
        yearWorkbookChecked = true;
        details.push("Year setup workbook is reachable.");
      } else {
        details.push("Year setup workbook has not been created yet.");
      }
    }

    if (year?.id && block?.id) {
      const { data: blockWorkspace, error: blockWorkspaceError } = await admin
        .from("google_workspace_links")
        .select("google_setup_workbook_id")
        .eq("school_year_id", year.id)
        .eq("block_id", block.id)
        .maybeSingle();

      if (blockWorkspaceError) {
        details.push(`Could not check session workbook: ${blockWorkspaceError.message}`);
      } else if (blockWorkspace?.google_setup_workbook_id) {
        await googleGet({
          accessToken: providerToken,
          url: `https://sheets.googleapis.com/v4/spreadsheets/${blockWorkspace.google_setup_workbook_id}?fields=spreadsheetId`,
        });
        blockWorkbookChecked = true;
        details.push("Session workbook is reachable.");
      } else {
        details.push("Session workbook has not been created yet.");
      }
    }

    return {
      ok: true,
      message: "Google connection is working.",
      checkedAt,
      needsReconnect: false,
      yearWorkbookChecked,
      blockWorkbookChecked,
      details,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google health check failed.";

    return {
      ok: false,
      message: isReconnectProblem(message)
        ? "Google needs to be reconnected."
        : `Google check failed: ${message}`,
      checkedAt,
      needsReconnect: isReconnectProblem(message),
      yearWorkbookChecked,
      blockWorkbookChecked,
      details: [...details, message],
    };
  }
}
