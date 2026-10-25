import { createClient } from '@/lib/supabase/server';
import { getActiveContext } from '@/lib/auth';
import { StudentSubmissionsTableClient } from './student-submissions-table-client';
import { WorkflowActionButton } from '../blocks/block-workflow-actions';
import { Input } from '@/components/ui/input';

type RatingRow = {
  id?: string;
  club_offering_id: string;
  interest_level: string | null;
  interest_score: number | null;
  club_title?: string | null;
  section_label?: string | null;
};

type SubmissionRow = {
  id: string;
  student_id: string;
  student_name: string | null;
  student_email: string | null;
  grade: number | null;
  teacher_homeroom_text: string | null;
  submitted_at: string | null;
  participation_preference: string | null;
  max_clubs: number | null;
  top_choice_club_id: string | null;
  top_choice_title: string | null;
  is_latest: boolean | null;
  ratings: RatingRow[];
};

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'green' | 'slate' | 'blue' | 'orange';
}) {
  const className =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-900'
      : tone === 'blue'
        ? 'border-blue-200 bg-blue-50 text-blue-900'
        : tone === 'orange'
          ? 'border-orange-200 bg-orange-50 text-orange-900'
          : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-medium ${className}`}>
      {label}
    </span>
  );
}

function StudentFormCard({
  block,
  studentLink,
}: {
  block: any;
  studentLink: string;
}) {
  const studentFormOpen = Boolean(block.student_form_open);
  const clubFormOpen = Boolean(block.public_club_submission_open);
  const anyFormOpen = studentFormOpen || clubFormOpen;

  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-950">
              Student choice form
            </h2>

            {studentFormOpen ? (
              <StatusBadge label="Open to students" tone="green" />
            ) : clubFormOpen ? (
              <StatusBadge label="Club setup form is still open" tone="blue" />
            ) : (
              <StatusBadge label="Closed" tone="slate" />
            )}
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {studentFormOpen
              ? 'Students can submit club choices for this session now. Close the form when choices are complete and you are ready for matching.'
              : clubFormOpen
                ? 'Club setup form is still open. Open student choices when clubs are ready for students to choose.'
                : 'Open the student choice form when clubs are ready. Students will use it to choose clubs for the current session.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {studentFormOpen ? (
            <WorkflowActionButton
              blockId={block.id}
              actionType="close-forms"
              label="Close form for matching"
              variant="default"
              disabled={false}
            />
          ) : (
            <WorkflowActionButton
              blockId={block.id}
              actionType="open-student-form"
              label="Open student choice form"
              variant="default"
              disabled={studentFormOpen}
            />
          )}

          <WorkflowActionButton
            blockId={block.id}
            actionType="close-forms"
            label={anyFormOpen ? 'Close all forms' : 'Forms are closed'}
            disabled={!anyFormOpen}
          />
        </div>
      </div>

      <details className="mt-4 rounded-xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Show student form test link
        </summary>
        <div className="mt-3 space-y-2">
          <Input value={studentLink} readOnly />
          <p className="text-sm text-slate-500">
            Use this to test the student form for this session. For live use, open
            the form first so students can submit choices.
          </p>
        </div>
      </details>
    </div>
  );
}

export default async function StudentSubmissionsPage() {
  const supabase = await createClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Student Choices</h1>

        <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
          No active school year or current session is configured.
        </div>
      </div>
    );
  }

  const [{ data: submissions = [] }, { data: clubs = [] }] = await Promise.all([
    supabase
      .from('student_submissions')
      .select(
        '*, students(student_name, student_email, grade, teacher_homeroom_text), student_interest_ratings(*)'
      )
      .eq('block_id', block.id)
      .eq('is_latest', true)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('club_offerings')
      .select('id, club_title, section_label')
      .eq('block_id', block.id),
  ]);

  const clubsById = new Map<
    string,
    {
      club_title: string | null;
      section_label: string | null;
    }
  >();

  for (const club of clubs as any[]) {
    clubsById.set(club.id, {
      club_title: club.club_title ?? null,
      section_label: club.section_label ?? null,
    });
  }

  const submissionRows: SubmissionRow[] = (submissions as any[]).map(
    (submission) => {
      const topChoiceClub = submission.top_choice_club_id
        ? clubsById.get(submission.top_choice_club_id)
        : null;

      const ratings: RatingRow[] = Array.isArray(
        submission.student_interest_ratings
      )
        ? submission.student_interest_ratings.map((rating: any) => {
            const ratedClub = clubsById.get(rating.club_offering_id);

            return {
              id: rating.id,
              club_offering_id: rating.club_offering_id,
              interest_level: rating.interest_level,
              interest_score: rating.interest_score,
              club_title: ratedClub?.club_title ?? null,
              section_label: ratedClub?.section_label ?? null,
            };
          })
        : [];

      return {
        id: submission.id,
        student_id: submission.student_id,
        student_name: submission.students?.student_name ?? null,
        student_email: submission.students?.student_email ?? null,
        grade: submission.students?.grade ?? null,
        teacher_homeroom_text:
          submission.students?.teacher_homeroom_text ?? null,
        submitted_at: submission.submitted_at ?? null,
        participation_preference: submission.participation_preference ?? null,
        max_clubs: submission.max_clubs ?? null,
        top_choice_club_id: submission.top_choice_club_id ?? null,
        top_choice_title: topChoiceClub?.club_title ?? null,
        is_latest: submission.is_latest ?? null,
        ratings,
      };
    }
  );

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const studentLink = `${baseUrl}/student/block/${block.id}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Student Choices</h1>

        <p className="mt-1 text-sm text-slate-600">
          Check who has submitted and review student club choices.
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Current session:{' '}
          <span className="font-medium text-slate-700">
            {year.label} · {block.label}
          </span>
        </p>
      </div>

      <StudentFormCard block={block} studentLink={studentLink} />

      <StudentSubmissionsTableClient submissions={submissionRows} />
    </div>
  );
}
