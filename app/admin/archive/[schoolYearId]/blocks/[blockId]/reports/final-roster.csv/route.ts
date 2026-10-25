import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  const safe =
    /^[=+\-@]/.test(text) && text.length > 0 ? `'${text}` : text;

  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function displayClubName(club: any) {
  return (
    [club?.club_title, club?.section_label].filter(Boolean).join(' — ') ||
    'Unknown club'
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolYearId: string; blockId: string }> }
) {
  const { schoolYearId, blockId } = await params;
  const supabase = await createClient();

  const { data: block } = await supabase
    .from('blocks')
    .select('id, school_year_id, label')
    .eq('id', blockId)
    .eq('school_year_id', schoolYearId)
    .maybeSingle();

  if (!block) {
    return new NextResponse('Block not found', { status: 404 });
  }

  const { data: assignments = [], error } = await supabase
    .from('final_assignments')
    .select(
      'id, block_id, student_id, club_offering_id, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(club_title, section_label, meeting_days, sponsor_name)'
    )
    .eq('block_id', blockId);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const rows = [
    [
      'Club',
      'Section',
      'Meeting days',
      'Sponsor',
      'Student',
      'Grade',
      'Homeroom',
      'Email',
      'Student ID',
      'Club offering ID',
    ],
    ...(assignments as any[])
      .sort((a, b) => {
        const clubCompare = displayClubName(a.club_offerings).localeCompare(
          displayClubName(b.club_offerings)
        );

        if (clubCompare !== 0) return clubCompare;

        return String(a.students?.student_name ?? '').localeCompare(
          String(b.students?.student_name ?? '')
        );
      })
      .map((assignment) => [
        assignment.club_offerings?.club_title ?? '',
        assignment.club_offerings?.section_label ?? '',
        Array.isArray(assignment.club_offerings?.meeting_days)
          ? assignment.club_offerings.meeting_days.join('; ')
          : '',
        assignment.club_offerings?.sponsor_name ?? '',
        assignment.students?.student_name ?? '',
        assignment.students?.grade ?? '',
        assignment.students?.teacher_homeroom_text ?? '',
        assignment.students?.student_email ?? '',
        assignment.student_id ?? '',
        assignment.club_offering_id ?? '',
      ]),
  ];

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-final-roster-${blockId}.csv"`,
    },
  });
}