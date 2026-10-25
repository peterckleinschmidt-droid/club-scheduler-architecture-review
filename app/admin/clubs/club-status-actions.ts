'use server';

import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export type ClubStatusAction = 'make_available' | 'hide' | 'reactivate';
export type ClubStatusResult = { ok: boolean; message: string };

function refreshClubPaths() {
  ['/admin/clubs', '/admin/workflow', '/admin/prepare-form'].forEach((path) =>
    revalidatePath(path)
  );
}

export async function updateClubStudentStatus(input: {
  clubId: string;
  action: ClubStatusAction;
}): Promise<ClubStatusResult> {
  await requireRole(['admin']);
  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return { ok: false, message: 'No current school year or session is selected.' };
  }

  const { data: formLink, error: formError } = await admin
    .from('google_workspace_links')
    .select('google_student_form_id')
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  if (formError) {
    return { ok: false, message: `Could not check the student form: ${formError.message}` };
  }

  if (formLink?.google_student_form_id) {
    return {
      ok: false,
      message: 'Availability is locked because the student form has already been created.',
    };
  }

  const { data: club, error: clubError } = await admin
    .from('club_offerings')
    .select('id, club_title, sponsor_name, meeting_days, capacity_type, max_capacity, grade_limited, eligible_grades, eligible_grade, is_active, show_to_students')
    .eq('id', input.clubId)
    .eq('block_id', block.id)
    .maybeSingle();

  if (clubError || !club) {
    return { ok: false, message: `Could not load the club: ${clubError?.message ?? 'Not found'}` };
  }

  if (input.action === 'make_available') {
    const problems: string[] = [];
    if (!String(club.club_title ?? '').trim()) problems.push('add a club name');
    if (!String(club.sponsor_name ?? '').trim()) problems.push('add a leader');
    if (!Array.isArray(club.meeting_days) || club.meeting_days.length === 0) problems.push('choose a meeting day');
    if (club.capacity_type !== 'unlimited' && Number(club.max_capacity ?? 0) <= 0) problems.push('enter the number of spots');
    const eligibleGrades = Array.isArray(club.eligible_grades)
      ? club.eligible_grades
      : club.eligible_grade
        ? [club.eligible_grade]
        : [];
    if (club.grade_limited && eligibleGrades.length === 0) problems.push('choose at least one grade');

    const { data: openIssues, error: issueError } = await admin
      .from('club_validation_issues')
      .select('issue_text')
      .eq('block_id', block.id)
      .eq('club_offering_id', club.id)
      .eq('severity', 'error')
      .eq('resolution_status', 'open');

    if (issueError) {
      return { ok: false, message: `Could not check club issues: ${issueError.message}` };
    }

    const validationProblems = (openIssues ?? [])
      .map((issue) => String(issue.issue_text ?? '').trim())
      .filter(Boolean);
    problems.push(...validationProblems);

    if (problems.length > 0) {
      return {
        ok: false,
        message: `This club is still hidden. Please ${problems.join(', ')} before making it available.`,
      };
    }
  }

  const changes =
    input.action === 'make_available'
      ? { is_active: true, show_to_students: true }
      : input.action === 'hide'
        ? { show_to_students: false }
        : { is_active: true, show_to_students: false };

  const { error: updateError } = await admin
    .from('club_offerings')
    .update(changes)
    .eq('id', club.id)
    .eq('block_id', block.id);

  if (updateError) {
    return { ok: false, message: `Could not update club status: ${updateError.message}` };
  }

  refreshClubPaths();

  return {
    ok: true,
    message:
      input.action === 'make_available'
        ? 'Available to students.'
        : input.action === 'hide'
          ? 'Hidden from students.'
          : 'Reactivated and hidden for review.',
  };
}
