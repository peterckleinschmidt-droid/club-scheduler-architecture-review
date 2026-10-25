import { createElement } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import {
  togglePublicClubSubmission,
  rotatePublicClubToken,
} from './mutations';
import { ClubsTableClient } from './clubs-table-client';
import CopyClubsForwardClient from './copy-clubs-forward-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ClubRow = {
  id: string;
  club_title: string;
  section_label: string | null;
  description: string | null;
  club_title_es: string | null;
  section_label_es: string | null;
  description_es: string | null;
  spanish_translation_ready: boolean | null;
  sponsor_name: string | null;
  leader_email: string | null;
  meeting_days: string[] | null;
  capacity_type: string | null;
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  minimum_applies_to: string | null;
  grade_limited: boolean | null;
  eligible_grades: number[] | null;
  eligible_grade: number | null;
  matching_preference: string | null;
  admin_notes: string | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
  issue_count: number;
  issue_severities: string[];
};

function StaffClubActions({
  blockId,
  isOpen,
}: {
  blockId: string;
  isOpen: boolean;
}) {
  return createElement(
    'div',
    {
      className: 'flex flex-wrap gap-2',
    },
    createElement(
      'form',
      {
        action: togglePublicClubSubmission,
      },
      createElement('input', {
        type: 'hidden',
        name: 'block_id',
        value: blockId,
      }),
      createElement('input', {
        type: 'hidden',
        name: 'open',
        value: isOpen ? 'false' : 'true',
      }),
      createElement(
        Button,
        {
          type: 'submit',
          variant: isOpen ? 'outline' : 'default',
        },
        isOpen ? 'Close club setup form' : 'Open club setup form'
      )
    ),
    createElement(
      'form',
      {
        action: rotatePublicClubToken,
      },
      createElement('input', {
        type: 'hidden',
        name: 'block_id',
        value: blockId,
      }),
      createElement(
        Button,
        {
          type: 'submit',
          variant: 'outline',
        },
        'Create new link'
      )
    )
  );
}

export default async function ClubsPage() {
  const supabase = await createClient();
  const { block, year } = await getActiveContext();

  if (!year || !block) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Club Setup</h1>
        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No active school year or current session is configured.
        </div>
      </div>
    );
  }

  const publicLink = `${process.env.NEXT_PUBLIC_APP_URL}/club-offerings/block/${block.id}/submit?token=${block.public_club_submission_token}`;

  const [
    { data: clubsData = [] },
    { data: issuesData = [] },
    { data: googleWorkspace },
  ] = await Promise.all([
    supabase
      .from('club_offerings')
      .select('*')
      .eq('block_id', block.id)
      .order('club_title', { ascending: true }),

    supabase
      .from('club_validation_issues')
      .select('*, club_offerings(club_title)')
      .eq('block_id', block.id)
      .eq('resolution_status', 'open')
      .order('created_at', { ascending: false }),

    supabase
      .from('google_workspace_links')
      .select(
        'google_student_form_id, google_student_form_edit_url, google_student_form_responder_url'
      )
      .eq('school_year_id', year.id)
      .eq('block_id', block.id)
      .maybeSingle(),
  ]);

  const studentFormExists = Boolean(googleWorkspace?.google_student_form_id);

  const clubDataRows = (clubsData ?? []) as any[];
  const issueRows = (issuesData ?? []) as any[];

  const issuesByClubId = new Map<
    string,
    {
      count: number;
      severities: string[];
    }
  >();

  for (const issue of issueRows) {
    if (!issue.club_offering_id || issue.severity !== 'error') continue;

    const existing = issuesByClubId.get(issue.club_offering_id) ?? {
      count: 0,
      severities: [],
    };

    existing.count += 1;

    if (issue.severity && !existing.severities.includes(issue.severity)) {
      existing.severities.push(issue.severity);
    }

    issuesByClubId.set(issue.club_offering_id, existing);
  }

  const clubRows: ClubRow[] = clubDataRows.map((club) => {
    const issueSummary = issuesByClubId.get(club.id) ?? {
      count: 0,
      severities: [],
    };

    return {
      id: club.id,
      club_title: club.club_title,
      section_label: club.section_label,
      description: club.description,
      club_title_es: club.club_title_es,
      section_label_es: club.section_label_es,
      description_es: club.description_es,
      spanish_translation_ready: club.spanish_translation_ready,
      sponsor_name: club.sponsor_name,
      leader_email: club.leader_email,
      meeting_days: Array.isArray(club.meeting_days) ? club.meeting_days : [],
      capacity_type: club.capacity_type,
      max_capacity: club.max_capacity,
      minimum_viable_enrollment: club.minimum_viable_enrollment,
      minimum_applies_to: club.minimum_applies_to,
      grade_limited: club.grade_limited,
      eligible_grades: Array.isArray(club.eligible_grades)
        ? club.eligible_grades
        : null,
      eligible_grade: club.eligible_grade,
      matching_preference: club.matching_preference,
      admin_notes: club.admin_notes,
      is_active: club.is_active,
      show_to_students: club.show_to_students,
      issue_count: issueSummary.count,
      issue_severities: issueSummary.severities,
    };
  });

  const readyForStudentsCount = clubRows.filter((club) =>
    club.is_active !== false &&
    club.show_to_students !== false &&
    club.issue_count === 0
  ).length;
  const inactiveOrAttentionCount = clubRows.length - readyForStudentsCount;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Club Setup</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review club ideas and choose which clubs students can pick.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Current session:{' '}
          <span className="font-medium text-slate-700">
            {year.label} / {block.label}
          </span>
        </p>
      </div>

      {studentFormExists ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">Student form already created</div>
          <p className="mt-1">
            The club list is now linked to the Google Form students will use. You can still make
            small edits to existing clubs, but do not add or delete clubs for this session after the
            form has been created.
          </p>
          <p className="mt-1">
            If a new club must be added, do not use the existing form without talking through the
            workflow first.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <section className="space-y-4 rounded-2xl border bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Staff club form</h2>
              <p className="mt-1 text-sm text-slate-600">
                Share this link with staff who want to offer a club.
              </p>
            </div>
            <span
              className={
                block.public_club_submission_open
                  ? 'rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-900'
                  : 'rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700'
              }
            >
              {block.public_club_submission_open ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="mb-1 text-sm font-medium">Club sign-up link</div>
            <Input value={publicLink} readOnly />
          </div>

          <StaffClubActions
            blockId={block.id}
            isOpen={Boolean(block.public_club_submission_open)}
          />
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <h2 className="text-lg font-semibold">Club status</h2>
          <p className="mt-1 text-sm text-slate-600">A simple view of which clubs are ready and which need attention.</p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <SummaryStat label="Ready for students" value={readyForStudentsCount} />
            <SummaryStat label="Inactive or needs attention" value={inactiveOrAttentionCount} />
          </div>
        </section>
      </div>
      <CopyClubsForwardClient disabled={studentFormExists} />

       <ClubsTableClient clubs={clubRows} studentFormExists={studentFormExists} />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-slate-50 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}