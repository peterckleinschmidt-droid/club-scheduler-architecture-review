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

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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
    .select('id, school_year_id')
    .eq('id', blockId)
    .eq('school_year_id', schoolYearId)
    .maybeSingle();

  if (!block) {
    return new NextResponse('Block not found', { status: 404 });
  }

  const [
    { data: submissions = [], error: submissionsError },
    { data: finals = [], error: finalsError },
  ] = await Promise.all([
    supabase
      .from('student_submissions')
      .select(
        'id, block_id, student_id, max_clubs, top_choice_club_id, students(student_name, student_email, grade, teacher_homeroom_text)'
      )
      .eq('block_id', blockId)
      .eq('is_latest', true),
    supabase
      .from('final_assignments')
      .select(
        'id, student_id, club_offering_id, club_offerings(club_title, section_label)'
      )
      .eq('block_id', blockId),
  ]);

  if (submissionsError) {
    return new NextResponse(submissionsError.message, { status: 500 });
  }

  if (finalsError) {
    return new NextResponse(finalsError.message, { status: 500 });
  }

  const finalsByStudentId = new Map<string, any[]>();

  for (const finalAssignment of finals as any[]) {
    const existing = finalsByStudentId.get(finalAssignment.student_id) ?? [];
    existing.push(finalAssignment);
    finalsByStudentId.set(finalAssignment.student_id, existing);
  }

  const rows = [
    [
      'Student',
      'Email',
      'Grade',
      'Homeroom',
      'Requested clubs',
      'Assigned clubs count',
      'Unmet demand',
      'Assigned clubs',
      'Student ID',
    ],
    ...(submissions as any[])
      .sort((a, b) =>
        String(a.students?.student_name ?? '').localeCompare(
          String(b.students?.student_name ?? '')
        )
      )
      .map((submission) => {
        const assigned = finalsByStudentId.get(submission.student_id) ?? [];
        const requested = safeNumber(submission.max_clubs);
        const assignedCount = assigned.length;
        const unmetDemand = Math.max(0, requested - assignedCount);

        return [
          submission.students?.student_name ?? '',
          submission.students?.student_email ?? '',
          submission.students?.grade ?? '',
          submission.students?.teacher_homeroom_text ?? '',
          requested,
          assignedCount,
          unmetDemand,
          assigned
            .map((assignment) => displayClubName(assignment.club_offerings))
            .join('; '),
          submission.student_id ?? '',
        ];
      }),
  ];

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-student-assignments-${blockId}.csv"`,
    },
  });
}