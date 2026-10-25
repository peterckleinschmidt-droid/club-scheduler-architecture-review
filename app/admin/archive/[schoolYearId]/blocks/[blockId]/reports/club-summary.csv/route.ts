import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) && text.length > 0 ? `'${text}` : text;

  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function safeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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
    { data: clubs = [], error: clubsError },
    { data: finals = [], error: finalsError },
  ] = await Promise.all([
    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', blockId)
      .order('club_title', { ascending: true }),
    supabase
      .from('final_assignments')
      .select('id, club_offering_id')
      .eq('block_id', blockId),
  ]);

  if (clubsError) {
    return new NextResponse(clubsError.message, { status: 500 });
  }

  if (finalsError) {
    return new NextResponse(finalsError.message, { status: 500 });
  }

  const finalsByClubId = new Map<string, any[]>();

  for (const finalAssignment of finals as any[]) {
    const existing = finalsByClubId.get(finalAssignment.club_offering_id) ?? [];
    existing.push(finalAssignment);
    finalsByClubId.set(finalAssignment.club_offering_id, existing);
  }

  const rows = [
    [
      'Club',
      'Section',
      'Sponsor',
      'Leader email',
      'Meeting days',
      'Capacity type',
      'Max capacity',
      'Minimum viable enrollment',
      'Final assigned count',
      'Below minimum',
      'Over capacity',
      'Club offering ID',
    ],
    ...(clubs as any[]).map((club) => {
      const assignedCount = finalsByClubId.get(club.id)?.length ?? 0;
      const minimum = safeNumber(club.minimum_viable_enrollment);
      const maxCapacity = safeNumber(club.max_capacity);

      const belowMinimum = minimum > 0 && assignedCount < minimum;
      const overCapacity =
        club.capacity_type === 'limited' &&
        maxCapacity > 0 &&
        assignedCount > maxCapacity;

      return [
        club.club_title ?? '',
        club.section_label ?? '',
        club.sponsor_name ?? '',
        club.leader_email ?? '',
        Array.isArray(club.meeting_days) ? club.meeting_days.join('; ') : '',
        club.capacity_type ?? '',
        club.capacity_type === 'unlimited'
          ? 'Unlimited'
          : club.max_capacity ?? '',
        club.minimum_viable_enrollment ?? '',
        assignedCount,
        belowMinimum ? 'Yes' : 'No',
        overCapacity ? 'Yes' : 'No',
        club.id,
      ];
    }),
  ];

  return new NextResponse(csv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="archive-club-summary-${blockId}.csv"`,
    },
  });
}
