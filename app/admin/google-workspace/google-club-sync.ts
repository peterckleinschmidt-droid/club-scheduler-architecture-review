import { createAdminClient } from '@/lib/supabase/admin';
import {
  clearSheetRange,
  rangeForSheet,
  readSheetValues,
  writeSheetValues,
} from './google-workbook-utils';

type ClubRow = {
  id: string;
  club_title: string;
  section_label: string | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
};

export type ClubColumnSyncResult = {
  ok: boolean;
  message: string;
  clubCount: number;
  headers: string[];
};

const CODED_CHOICES_TAB = 'Coded Choices Export';

const BASE_CODED_CHOICE_HEADERS = [
  'student_code',
  'grade',
  'homeroom_code',
  'max_clubs',
  'top_choice',
];

function displayClubName(club: ClubRow) {
  return club.section_label
    ? `${club.club_title} (${club.section_label})`
    : club.club_title;
}

function uniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();

  return headers.map((header) => {
    const normalized = header.trim().toLowerCase();
    const count = seen.get(normalized) ?? 0;

    seen.set(normalized, count + 1);

    if (count === 0) {
      return header;
    }

    return `${header} ${count + 1}`;
  });
}

export async function getCurrentBlockClubHeaders({
  blockId,
}: {
  blockId: string;
}) {
  const admin = createAdminClient();

  const { data: clubs, error } = await admin
    .from('club_offerings')
    .select('id, club_title, section_label, is_active, show_to_students')
    .eq('block_id', blockId)
    .eq('is_active', true)
    .eq('show_to_students', true)
    .order('club_title', { ascending: true })
    .order('section_label', { ascending: true });

  if (error) {
    throw new Error(`Could not load clubs: ${error.message}`);
  }

  const clubRows = (clubs ?? []) as ClubRow[];
  const clubHeaders = clubRows.map(displayClubName);

  return uniqueHeaders([...BASE_CODED_CHOICE_HEADERS, ...clubHeaders]);
}

export async function refreshBlockClubColumnsFromScheduler({
  accessToken,
  blockWorkbookId,
  blockId,
}: {
  accessToken: string;
  blockWorkbookId: string;
  blockId: string;
}): Promise<ClubColumnSyncResult> {
  const headers = await getCurrentBlockClubHeaders({
    blockId,
  });

  const clubCount = Math.max(0, headers.length - BASE_CODED_CHOICE_HEADERS.length);
  const existing = (await readSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet(CODED_CHOICES_TAB, 'A2:ZZ'),
  })) as { values?: string[][] };
  const hasChoiceRows = (existing.values ?? []).some((row) =>
    row.some((cell) => String(cell ?? '').trim())
  );
  if (hasChoiceRows) {
    throw new Error(
      'Club columns cannot be refreshed after student choices have been prepared. This protects existing ratings from being moved under different club names.'
    );
  }

  await clearSheetRange({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet(CODED_CHOICES_TAB, 'A1:ZZ1'),
  });

  await writeSheetValues({
    accessToken,
    spreadsheetId: blockWorkbookId,
    range: rangeForSheet(CODED_CHOICES_TAB, 'A1'),
    values: [headers],
    valueInputOption: 'RAW',
  });

  return {
    ok: true,
    message: `Updated coded choice columns for ${clubCount} clubs.`,
    clubCount,
    headers,
  };
}