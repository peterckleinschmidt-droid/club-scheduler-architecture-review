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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ schoolYearId: string; blockId: string }> }
) {
  const { schoolYearId, blockId } = await params;
  const supabase = await createClient();

  const { data: block } = await supabase
    .from('blocks')
    .select('id, school_year_id')
    .eq('id', blockId)
    .eq('school_year_id', schoolYearId)
    .maybeSingle();

  if (!block) {
    return new NextResponse('Block not found', { status: 404 });
  }

  const { data: snapshot } = await supabase
    .from('history_snapshots')
    .select('*')
    .eq('block_id', blockId)
    .maybeSingle();

  if (!snapshot) {
    const emptyRows = [
      [
        'Student',
        'Email',
        'Grade',
        'Homeroom',
        'Clubs received',
        'Got top choice',
        'Unmet demand',
        'Zero club flag',
        'Student ID',
      ],
    ];

    return new NextResponse(csv(emptyRows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="archive-student-outcomes-${blockId}.csv"`,
      },
    });
  }

  const { data: outcomes = [], error } = await supabase
    .from('history_student_outcomes')
    .select(
      'id, student_id, clubs_received, got_top_choice, unmet_demand, zero_club_flag, students(student_name, student_email, grade, teacher_homeroom_text)'
    )
    .eq('history_snapshot_id', snapshot.id);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const rows = [
    [
      'Student',
      'Email',
      'Grade',
      'Homeroom',
      'Clubs received',
      'Got top choice',
      'Unmet demand',
      'Zero club flag',
      'Student ID',
    ],
    ...(outcomes as any[])
      .sort((a, b) =>
        String(a.students?.student_name ?? '').localeCompare(
          String(b.students?.student_name ?? '')
        )
      )
      .map((outcome) => [
        outcome.students?.student_name ?? '',
        outcome.students?.student_email ?? '',
        outcome.students?.grade ?? '',
        outcome.students?.teacher_homeroom_text ?? '',
        outcome.clubs_received ?? 0,
        outcome.got_top_choice ? 'Yes' : 'No',
        outcome.unmet_demand ?? 0,
        outcome.zero_club_flag ? 'Yes' : 'No',
        outcome.student_id ?? '',
      ]),
  ];

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-student-outcomes-${blockId}.csv"`,
    },
  });
}