import { createElement, type ReactNode } from 'react';
import { getActiveContext, requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import ConnectGoogleFormsClient from './connect-google-client';
import CreateGoogleFormClient from './create-google-form-client';
import ConnectExistingFormResponsesClient from './connect-existing-form-responses-client';

type ClubRow = {
  id: string;
  club_title: string;
  section_label: string | null;
  description: string | null;
  club_title_es?: string | null;
  section_label_es?: string | null;
  description_es?: string | null;
  spanish_translation_ready?: boolean | null;
  grade_limited: boolean | null;
  eligible_grade: number | null;
  eligible_grades?: number[] | string[] | null;
  is_active: boolean | null;
  show_to_students: boolean | null;
};

type TeacherRow = {
  id: string;
  teacher_name: string;
  is_active: boolean | null;
  sort_order: number | null;
};

const GRADES = [3, 4, 5] as const;

type Grade = (typeof GRADES)[number];

function normalizeEligibleGrades(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as number[];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => [3, 4, 5].includes(item));
}

function eligibleGradesForClub(club: ClubRow) {
  if (!club.grade_limited) {
    return [...GRADES];
  }

  const eligibleGrades = normalizeEligibleGrades(club.eligible_grades);

  if (eligibleGrades.length > 0) {
    return eligibleGrades;
  }

  if (club.eligible_grade && [3, 4, 5].includes(club.eligible_grade)) {
    return [club.eligible_grade];
  }

  return [...GRADES];
}

function displayClubName(club: ClubRow) {
  return club.section_label
    ? `${club.club_title} (${club.section_label})`
    : club.club_title;
}

function clubsForGrade(clubs: ClubRow[], grade: Grade) {
  return clubs.filter((club) => eligibleGradesForClub(club).includes(grade));
}

function textareaValue(lines: string[]) {
  return lines.join('\n');
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <textarea
        readOnly
        value={value}
        className="mt-2 min-h-40 w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-sm text-slate-900"
      />
    </div>
  );
}

function DownloadTemplateButton() {
  return createElement(
    'a',
    {
      href: '/admin/prepare-form/template.csv',
      className:
        'inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50',
    },
    'Download response template'
  );
}

export default async function PrepareFormPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(['admin']);

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const googleFormsStatus = resolvedSearchParams.googleForms;

  const admin = createAdminClient();
  const { year, block } = await getActiveContext();

  if (!year || !block) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Create student form
        </h1>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          No active school year or current session is configured yet.
        </div>
      </main>
    );
  }

  const [{ data: clubsData, error: clubsError }, { data: teachersData, error: teachersError }] =
    await Promise.all([
      admin
        .from('club_offerings')
        .select(
          'id, club_title, section_label, description, club_title_es, section_label_es, description_es, spanish_translation_ready, grade_limited, eligible_grade, eligible_grades, is_active, show_to_students'
        )
        .eq('block_id', block.id)
        .eq('is_active', true)
        .eq('show_to_students', true)
        .order('club_title'),
      admin
        .from('teachers')
        .select('id, teacher_name, is_active, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('teacher_name', { ascending: true }),
    ]);

  const clubs = (clubsData ?? []) as ClubRow[];
  const teachers = (teachersData ?? []) as TeacherRow[];

  const { data: formWorkspace } = await admin
    .from('google_workspace_links')
    .select('google_student_form_id')
    .eq('school_year_id', year.id)
    .eq('block_id', block.id)
    .maybeSingle();

  const hasExistingGoogleForm = Boolean(formWorkspace?.google_student_form_id);

  const teacherList = teachers.map((teacher) => teacher.teacher_name);
  const allClubNames = clubs.map(displayClubName);

  const gradeClubLists = GRADES.map((grade) => ({
    grade,
    clubs: clubsForGrade(clubs, grade).map(displayClubName),
  }));

  const spanishNeedsReview = clubs.filter((club) => !club.spanish_translation_ready || !club.club_title_es || !club.description_es);
  const responseHeaders = [
    'Timestamp',
    'Email Address',
    'Student Name',
    'Grade',
    'Homeroom',
    'Max Clubs',
    'Top Choice',
    ...allClubNames,
  ];

  const questions = [
    'Page 1: About you',
    'Question: What is your full name?',
    'Type: Short answer',
    '',
    'Question: What grade are you in?',
    'Type: Multiple choice',
    'Choices: 3, 4, 5',
    'Use this question to send students to the correct grade section.',
    '',
    'Question: Who is your teacher?',
    'Type: Dropdown',
    'Choices: Paste the teacher list from this page.',
    '',
    'Grade sections',
    'Create one section for Grade 3, one for Grade 4, and one for Grade 5.',
    'Each section should only include clubs available to that grade.',
    '',
    'For each club, use this question format:',
    'Question title: How interested are you in [Exact club name from this page]?',
    'Question type: Multiple choice',
    'Choices: I really want this club, I might like this club, No thanks',
    '',
    'At the end of each grade section, add:',
    'Question: How many clubs would you like to join?',
    'Type: Multiple choice',
    'Choices: 1, 2, 3',
    '',
    'Question: If you could only get one club, which one would you want most?',
    'Type: Multiple choice',
    'Choices: Paste the club list for that grade.',
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Create student form
        </h1>

        <p className="mt-2 max-w-3xl text-slate-600">
          Create a Google Form from the clubs and homerooms already set up in Scheduler. After
          creating it, return to the session workbook and use Google Workflow to find and connect the form.
        </p>

        <p className="mt-1 text-sm text-slate-500">
          Current setup: {year.label} / {block.label}
        </p>
      </div>

      {googleFormsStatus === 'connected' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          Google Forms is connected. You can create the form now.
        </div>
      ) : null}

      {googleFormsStatus === 'connection-failed' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Google Forms could not be connected. Try again. If it keeps happening, the district may
          need to approve this app for Google Forms access.
        </div>
      ) : null}

      {spanishNeedsReview.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">Spanish needs a quick review</div>
          <p className="mt-1">{spanishNeedsReview.length} club{spanishNeedsReview.length === 1 ? '' : 's'} will use English where reviewed Spanish is not ready. You can create the form now or return to Club Setup first.</p>
          <a href="/admin/clubs" className="mt-2 inline-flex font-medium underline">Review club Spanish</a>
        </div>
      ) : null}
      <SectionCard title="Create the Google Form">
        <p className="text-sm text-slate-700">
          First connect Google Forms. Then create the form. The form will be created in your Google
          account using the current session, clubs, homerooms, and grade rules.
        </p>

        <div className="flex flex-wrap gap-3">
          <ConnectGoogleFormsClient />
          <CreateGoogleFormClient />
          {hasExistingGoogleForm ? <ConnectExistingFormResponsesClient /> : null}
        </div>

        <p className="text-xs text-slate-500">
          After the form is created, return to the session workbook, open Google Workflow, and choose Find student form. Then connect the form so new responses can be prepared for matching. Connecting responses does not change the form's questions or overwrite edits made in Google Forms.
        </p>
      </SectionCard>

      {(clubsError || teachersError) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          {clubsError ? <p>Could not load clubs: {clubsError.message}</p> : null}
          {teachersError ? <p>Could not load teachers: {teachersError.message}</p> : null}
        </div>
      ) : null}

      <SectionCard title="What the form includes">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Name, grade, and teacher.</li>
          <li>Grade-specific club pages with one rating question per club.</li>
          <li>Three child-friendly choices: I really want this club, I might like this club, and No thanks.</li>
          <li>Only grade-eligible clubs appear after the student chooses a grade.</li>
          <li>Maximum clubs and top choice appear at the end of the grade-specific page.</li>
          <li>Verified school email is collected automatically from the signed-in Google account.</li>
        </ul>
      </SectionCard>

      <details className="rounded-xl border bg-white shadow-sm"><summary className="cursor-pointer p-5 text-lg font-semibold text-slate-900">Manual setup and troubleshooting</summary><div className="space-y-6 border-t p-5"><SectionCard title="Manual form setup">
        <p className="text-sm text-slate-600">
          Use these instructions only if automatic form creation is unavailable or support asks you to check the generated questions.
        </p>

        <div className="space-y-6">
          <CopyBox
            label="Suggested question wording"
            value={textareaValue(questions)}
          />

          <CopyBox
            label="Teacher dropdown list"
            value={
              teacherList.length > 0
                ? textareaValue(teacherList)
                : 'No active teachers were found.'
            }
          />
        </div>
      </SectionCard>

      <SectionCard title="Club lists by grade">
        <div className="grid gap-4 md:grid-cols-3">
          {gradeClubLists.map(({ grade, clubs: gradeClubs }) => (
            <div key={grade}>
              <CopyBox
                label={`Grade ${grade} clubs`}
                value={
                  gradeClubs.length > 0
                    ? textareaValue(gradeClubs)
                    : 'No clubs are currently available for this grade.'
                }
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Legacy response template">
        <p className="text-sm text-slate-600">
          This template is retained for troubleshooting older manual imports. It is not needed for the normal Google Workflow.
        </p>

        <div className="flex flex-wrap gap-3">
          <DownloadTemplateButton />
        </div>

        <CopyBox label="CSV header row" value={responseHeaders.join(',')} />
      </SectionCard></div></details>
    </main>
  );
}