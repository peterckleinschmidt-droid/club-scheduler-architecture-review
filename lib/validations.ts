import { createAdminClient } from '@/lib/supabase/admin';

export async function validateClubOffering(blockId: string, clubId: string) {
  const supabase = createAdminClient();

  await supabase.from('club_validation_issues').delete().eq('club_offering_id', clubId);

  const { data: club } = await supabase
    .from('club_offerings')
    .select('*')
    .eq('id', clubId)
    .single();

  if (!club) return;

  const issues: any[] = [];

  const addIssue = (
    field_name: string,
    issue_text: string,
    severity: 'error' | 'warning' = 'error'
  ) => {
    issues.push({
      block_id: blockId,
      club_offering_id: clubId,
      severity,
      field_name,
      issue_text,
    });
  };

  if (!club.club_title?.trim()) {
    addIssue('club_title', 'Missing club title');
  }

  if (!club.sponsor_name?.trim()) {
    addIssue('sponsor_name', 'Missing sponsor / host / leader');
  }

  if (!club.meeting_days || club.meeting_days.length === 0) {
    addIssue('meeting_days', 'Missing meeting day');
  }

  if (club.capacity_type === 'limited' && (!club.max_capacity || club.max_capacity < 1)) {
    addIssue('max_capacity', 'Limited capacity requires a valid maximum');
  }

  const eligibleGrades = Array.isArray(club.eligible_grades) ? club.eligible_grades : [];

  if (club.grade_limited && eligibleGrades.length === 0) {
    addIssue('eligible_grades', 'Grade-limited clubs require at least one eligible grade');
  }


  const { data: duplicates } = await supabase
    .from('club_offerings')
    .select('id')
    .eq('block_id', blockId)
    .eq('club_title', club.club_title)
    .eq('section_label', club.section_label || '')
    .contains('meeting_days', club.meeting_days || []);

  if ((duplicates || []).filter((d: any) => d.id !== clubId).length > 0) {
    addIssue('club_title', 'Duplicate or ambiguous title + section + day');
  }

  if (issues.length > 0) {
    await supabase.from('club_validation_issues').insert(issues);
  }
}