import { NextResponse } from 'next/server';
import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

type ClubRow = {
  club_title: string;
  section_label: string | null;
};

function displayClubName(club: ClubRow) {
  return club.section_label
    ? `${club.club_title} (${club.section_label})`
    : club.club_title;
}

function escapeCsvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export async function GET() {
  await requireRole(['admin']);

  const admin = createAdminClient();
  const { block } = await getActiveContext();

  if (!block) {
    return new NextResponse('No current session was found.', { status: 400 });
  }

  const { data: clubs, error } = await admin
    .from('club_offerings')
    .select('club_title, section_label')
    .eq('block_id', block.id)
    .eq('is_active', true)
    .eq('show_to_students', true)
    .order('club_title');

  if (error) {
    return new NextResponse(`Could not load clubs: ${error.message}`, { status: 500 });
  }

  const headers = [
    'Timestamp',
    'Email Address',
    'What is your full name?',
    'What grade are you in?' ,
    'Who is your homeroom teacher?',
    'How many clubs would you like to join?',
    'If you could only get one club, which one would you want most?',
    ...((clubs ?? []) as ClubRow[]).map((club) => `How interested are you in ${displayClubName(club)}?`),
  ];

  const csv = `${headers.map(escapeCsvCell).join(',')}\n`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="student-choice-response-template.csv"',
    },
  });
}