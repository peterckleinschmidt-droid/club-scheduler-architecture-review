import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { RostersClient } from './rosters-client';

type RosterRow = {
  id: string;
  club_offering_id: string;
  student_id: string;
  student_name: string | null;
  grade: number | null;
  homeroom: string | null;
  club_title: string | null;
  section_label: string | null;
  leader_name: string | null;
  meeting_days: string[];
};

export default async function Rosters() {
  const supabase = await createClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Print Rosters</h1>
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
          No current school year or club session is set.
        </div>
      </div>
    );
  }

  const { data } = await supabase
    .from('final_assignments')
    .select(
      'id, club_offering_id, student_id, students(student_name, grade, teacher_homeroom_text, teachers(teacher_name)), club_offerings(club_title, section_label, sponsor_name, meeting_days)'
    )
    .eq('block_id', block.id)
    .order('club_offering_id');

  const rosterRows: RosterRow[] = ((data ?? []) as any[]).map((assignment) => {
    const student = assignment.students;
    const club = assignment.club_offerings;

    return {
      id: assignment.id,
      club_offering_id: assignment.club_offering_id,
      student_id: assignment.student_id,
      student_name: student?.student_name ?? null,
      grade: student?.grade ?? null,
      homeroom:
        student?.teacher_homeroom_text ?? student?.teachers?.teacher_name ?? null,
      club_title: club?.club_title ?? null,
      section_label: club?.section_label ?? null,
      leader_name: club?.sponsor_name ?? null,
      meeting_days: Array.isArray(club?.meeting_days) ? club.meeting_days : [],
    };
  });

  return (
    <RostersClient
      rows={rosterRows}
      schoolYearLabel={year.label ?? 'School year'}
      blockLabel={block.label ?? 'Current session'}
    />
  );
}
