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
    ''
  );
}

function actionLabel(actionType: string | null | undefined) {
  if (actionType === 'manual_add') return 'Manual add';
  if (actionType === 'manual_remove') return 'Manual remove';
  if (actionType === 'manual_move') return 'Manual move';
  if (actionType === 'needs_attention_addressed') {
    return 'Needs attention addressed';
  }

  return actionType ?? 'Override';
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

  const { data: overrides = [], error } = await supabase
    .from('assignment_overrides')
    .select(
      'id, action_type, reason, created_at, student_id, club_offering_id, students(student_name, student_email, grade, teacher_homeroom_text), club_offerings(club_title, section_label)'
    )
    .eq('block_id', blockId)
    .order('created_at', { ascending: false });

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const rows = [
    [
      'Created at',
      'Action',
      'Student',
      'Email',
      'Grade',
      'Homeroom',
      'Club',
      'Reason',
      'Student ID',
      'Club offering ID',
      'Override ID',
    ],
    ...(overrides as any[]).map((override) => [
      override.created_at ?? '',
      actionLabel(override.action_type),
      override.students?.student_name ?? '',
      override.students?.student_email ?? '',
      override.students?.grade ?? '',
      override.students?.teacher_homeroom_text ?? '',
      displayClubName(override.club_offerings),
      override.reason ?? '',
      override.student_id ?? '',
      override.club_offering_id ?? '',
      override.id ?? '',
    ]),
  ];

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-overrides-${blockId}.csv"`,
    },
  });
}