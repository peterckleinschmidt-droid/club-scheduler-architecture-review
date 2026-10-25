'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type InterestValue = 'not_interested' | 'would_try' | 'really_want';
type MaxClubs = '0' | '1' | '2' | '3';

type TeacherRow = {
  id: string;
  teacher_name: string;
};

type ClubRow = {
  id: string;
  club_title: string | null;
  section_label: string | null;
  description: string | null;
  sponsor_name: string | null;
  meeting_days: string[] | null;
  category?: string | null;
};

type StudentClubFormClientProps = {
  userEmail: string;
  student: any;
  teachers: TeacherRow[];
  clubs: ClubRow[];
  latestSubmission: any;
  defaultTeacherSelection: string;
  defaultTeacherOther: string;
  initialScores: Record<string, number>;
  action: (formData: FormData) => void | Promise<void>;
};

function scoreToInterest(score: number | undefined): InterestValue | undefined {
  if (score === undefined || score === null) return undefined;
  if (Number(score) <= 0) return 'not_interested';
  if (Number(score) === 1) return 'would_try';
  return 'really_want';
}

function interestToScore(value: InterestValue | undefined) {
  if (!value) return '';
  if (value === 'not_interested') return '0';
  if (value === 'would_try') return '1';
  return '2';
}

function displayClubName(club: ClubRow) {
  return [club.club_title, club.section_label].filter(Boolean).join(' — ');
}

function clubCardColor(index: number) {
  const colors = [
    {
      card: 'border-purple-300 bg-purple-50',
      header: 'bg-purple-700 text-white',
    },
    {
      card: 'border-blue-300 bg-blue-50',
      header: 'bg-blue-700 text-white',
    },
    {
      card: 'border-green-300 bg-green-50',
      header: 'bg-green-700 text-white',
    },
    {
      card: 'border-orange-300 bg-orange-50',
      header: 'bg-orange-600 text-white',
    },
    {
      card: 'border-teal-300 bg-teal-50',
      header: 'bg-teal-700 text-white',
    },
    {
      card: 'border-pink-300 bg-pink-50',
      header: 'bg-pink-700 text-white',
    },
  ];

  return colors[index % colors.length];
}

function interestLabel(value: InterestValue) {
  if (value === 'not_interested') return 'Do not place me here';
  if (value === 'would_try') return 'I would try this';
  return 'I really want this';
}

function interestTone(value: InterestValue) {
  if (value === 'not_interested') {
    return 'border-slate-700 bg-slate-700 text-white';
  }

  if (value === 'would_try') {
    return 'border-blue-600 bg-blue-700 text-white';
  }

  return 'border-green-600 bg-green-700 text-white';
}

function StepPill({ number, title }: { number: number; title: string }) {
  return (
    <div className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 shadow-sm">
      Step {number}: {title}
    </div>
  );
}

function ChoiceExplainerCard({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: 'slate' | 'blue' | 'green';
}) {
  const className =
    tone === 'slate'
      ? 'border-slate-400 bg-slate-100 text-slate-950'
      : tone === 'blue'
        ? 'border-blue-700 bg-blue-700 text-white'
        : 'border-green-700 bg-green-700 text-white';

  return (
    <div className={`rounded-2xl border-2 p-4 shadow-sm ${className}`}>
      <div className="text-base font-black">{title}</div>
      <p
        className={
          tone === 'slate'
            ? 'mt-1 text-sm leading-6 text-slate-700'
            : 'mt-1 text-sm leading-6 text-white/90'
        }
      >
        {description}
      </p>
    </div>
  );
}

function InterestButton({
  value,
  selected,
  onClick,
}: {
  value: InterestValue;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? `rounded-2xl border-2 px-4 py-3 text-sm font-black shadow-sm ${interestTone(
              value
            )}`
          : 'rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm hover:border-slate-500 hover:bg-slate-50'
      }
    >
      {interestLabel(value)}
    </button>
  );
}

function MaxClubButton({
  value,
  selected,
  onClick,
}: {
  value: MaxClubs;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        selected
          ? value === '0'
            ? 'rounded-2xl border-2 border-slate-800 bg-slate-700 px-5 py-4 text-left text-white shadow-sm'
            : 'rounded-2xl border-2 border-indigo-800 bg-indigo-700 px-5 py-4 text-left text-white shadow-sm'
          : value === '0'
            ? 'rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-left text-slate-900 shadow-sm hover:border-slate-600 hover:bg-slate-50'
            : 'rounded-2xl border-2 border-slate-300 bg-white px-5 py-4 text-left text-slate-900 shadow-sm hover:border-indigo-500 hover:bg-indigo-50'
      }
    >
      <div className="text-lg font-black">
        {value} club{value === '1' ? '' : 's'}
      </div>
      <div
        className={
          selected ? 'mt-1 text-sm text-white/90' : 'mt-1 text-sm text-slate-600'
        }
      >
        {value === '0'
          ? 'Choose this if you do not want clubs this session.'
          : value === '1'
            ? 'Best choice for most students who want a club.'
            : value === '2'
              ? 'Choose this if you would be happy with two clubs.'
              : 'Choose this only if you would be happy with three clubs.'}
      </div>
    </button>
  );
}

function ClubCard({
  club,
  index,
  selectedInterest,
  onSelectInterest,
  disabled,
}: {
  club: ClubRow;
  index: number;
  selectedInterest: InterestValue | undefined;
  onSelectInterest: (value: InterestValue) => void;
  disabled: boolean;
}) {
  const colors = clubCardColor(index);

  return (
    <div
      className={`overflow-hidden rounded-3xl border-2 shadow-sm ${
        disabled ? 'border-slate-200 bg-slate-50 opacity-70' : colors.card
      }`}
    >
      <input
        type="hidden"
        name={`interest_${club.id}`}
        value={interestToScore(selectedInterest)}
      />

      <div className={`px-5 py-3 ${disabled ? 'bg-slate-500 text-white' : colors.header}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-black">
              {displayClubName(club) || 'Untitled club'}
            </h3>
            <div className="mt-1 text-sm opacity-90">
              {(club.meeting_days || []).length > 0
                ? (club.meeting_days || []).join(', ')
                : 'Meeting day not listed'}
            </div>
          </div>

          {club.sponsor_name ? (
            <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
              Club leader: {club.sponsor_name}
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm leading-6 text-slate-800">
          {club.description || 'No description provided.'}
        </p>

        {disabled ? (
          <div className="mt-5 rounded-2xl border border-slate-300 bg-white p-4 text-sm font-semibold text-slate-700">
            You chose 0 clubs, so you do not need to rate individual clubs.
          </div>
        ) : (
          <div className="mt-5">
            <div className="mb-2 text-base font-black text-slate-950">
              What should we do with this club?
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <InterestButton
                value="not_interested"
                selected={selectedInterest === 'not_interested'}
                onClick={() => onSelectInterest('not_interested')}
              />
              <InterestButton
                value="would_try"
                selected={selectedInterest === 'would_try'}
                onClick={() => onSelectInterest('would_try')}
              />
              <InterestButton
                value="really_want"
                selected={selectedInterest === 'really_want'}
                onClick={() => onSelectInterest('really_want')}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentClubFormClient({
  userEmail,
  student,
  teachers,
  clubs,
  latestSubmission,
  defaultTeacherSelection,
  defaultTeacherOther,
  initialScores,
  action,
}: StudentClubFormClientProps) {
  const initialInterests = Object.fromEntries(
    clubs
      .map((club) => [club.id, scoreToInterest(initialScores[club.id])] as const)
      .filter(([, value]) => value !== undefined)
  ) as Record<string, InterestValue>;

  const initialMaxClubs =
    latestSubmission?.max_clubs !== null &&
    latestSubmission?.max_clubs !== undefined &&
    [0, 1, 2, 3].includes(Number(latestSubmission.max_clubs))
      ? (String(Number(latestSubmission.max_clubs)) as MaxClubs)
      : '1';

  const [studentName, setStudentName] = useState(student?.student_name ?? '');
  const [grade, setGrade] = useState(
    student?.grade ? String(student.grade) : ''
  );
  const [teacherSelection, setTeacherSelection] = useState(
    defaultTeacherSelection
  );
  const [teacherOther, setTeacherOther] = useState(defaultTeacherOther);
  const [maxClubs, setMaxClubs] = useState<MaxClubs>(initialMaxClubs);
  const [topChoice, setTopChoice] = useState(
    latestSubmission?.top_choice_club_id ?? ''
  );
  const [interests, setInterests] =
    useState<Record<string, InterestValue>>(initialInterests);

  const wantsNoClubs = maxClubs === '0';
  const ratedCount = Object.keys(interests).length;

  const allClubsRated = ratedCount === clubs.length;
  const hasStudentInfo =
    studentName.trim().length > 0 &&
    grade.trim().length > 0 &&
    teacherSelection.trim().length > 0 &&
    (teacherSelection !== '__other__' || teacherOther.trim().length > 0);

  const positiveInterestClubs = useMemo(
    () =>
      clubs.filter(
        (club) =>
          interests[club.id] === 'would_try' ||
          interests[club.id] === 'really_want'
      ),
    [clubs, interests]
  );

  const reallyWantClubs = useMemo(
    () => clubs.filter((club) => interests[club.id] === 'really_want'),
    [clubs, interests]
  );

  const wouldTryClubs = useMemo(
    () => clubs.filter((club) => interests[club.id] === 'would_try'),
    [clubs, interests]
  );

  const topChoiceOptions =
    reallyWantClubs.length > 0
      ? reallyWantClubs
      : [...reallyWantClubs, ...wouldTryClubs];

  const hasTopChoice =
    wantsNoClubs ||
    (topChoice.trim().length > 0 &&
      positiveInterestClubs.some((club) => club.id === topChoice));

  const canSubmit = wantsNoClubs
    ? hasStudentInfo
    : clubs.length > 0 && hasStudentInfo && allClubsRated && hasTopChoice;

  const missingMessage = !hasStudentInfo
    ? 'Finish Step 1 before submitting.'
    : wantsNoClubs
      ? ''
      : clubs.length === 0
        ? 'There are no clubs available right now.'
        : !allClubsRated
          ? `Answer ${clubs.length - ratedCount} more club${
              clubs.length - ratedCount === 1 ? '' : 's'
            } before submitting.`
          : positiveInterestClubs.length === 0
            ? 'Choose at least one club as “I would try this” or “I really want this,” or choose 0 clubs.'
            : !hasTopChoice
              ? 'Choose your #1 choice before submitting.'
              : '';

  function setClubInterest(clubId: string, value: InterestValue) {
    setInterests((current) => ({
      ...current,
      [clubId]: value,
    }));

    if (value === 'not_interested' && topChoice === clubId) {
      setTopChoice('');
    }
  }

  function handleMaxClubsChange(value: MaxClubs) {
    setMaxClubs(value);

    if (value === '0') {
      setTopChoice('');
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!canSubmit) {
      event.preventDefault();
      window.alert(missingMessage);
      return;
    }

    if (wantsNoClubs) {
      const confirmed = window.confirm(
        'You chose 0 clubs. This means you are asking not to be matched to any clubs this session. Are you sure?'
      );

      if (!confirmed) {
        event.preventDefault();
      }
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="space-y-7">
      <input type="hidden" name="max_clubs" value={maxClubs} />

      <div className="relative overflow-hidden rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-emerald-50 via-sky-50 to-violet-50 p-7 shadow-sm">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-sky-100/80" />
        <div className="absolute bottom-0 left-0 h-24 w-40 rounded-tr-full bg-emerald-100/80" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex rounded-full border border-sky-300 bg-white/80 px-3 py-1 text-sm font-black uppercase tracking-wide text-sky-900">
              Club sign-up
            </div>

            <h1 className="mt-4 text-4xl font-black text-slate-950">
              Choose your clubs
            </h1>

            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-700">
              Tell us which clubs sound good to you. Your choices help us build
              your club schedule. There are no wrong answers.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-sky-200 bg-white/85 p-4 text-sm text-slate-800 shadow-sm">
            <div className="font-black text-slate-950">Progress</div>
            <div className="mt-2">
              {wantsNoClubs
                ? '0 clubs selected'
                : `${ratedCount} of ${clubs.length} clubs rated`}
            </div>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{
                  width: wantsNoClubs
                    ? '100%'
                    : clubs.length > 0
                      ? `${Math.round((ratedCount / clubs.length) * 100)}%`
                      : '0%',
                }}
              />
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          <StepPill number={1} title="About you" />
          <StepPill number={2} title="How many clubs" />
          <StepPill number={3} title="Rate each club" />
          <StepPill number={4} title="Pick your favorite" />
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Signed in as: <span className="font-semibold">{userEmail}</span>
      </div>

      {latestSubmission ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-900">
          Your previous responses are filled in below. If the form is still open,
          you can make changes and submit again.
        </div>
      ) : null}

      <section className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-950">
            Step 1: About you
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            This helps us match your choices to the right grade and classroom.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-800">
              Student name
            </label>
            <Input
              name="student_name"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-800">
              Grade
            </label>
            <select
              name="grade"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select grade</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-800">
              Teacher / Homeroom
            </label>
            <select
              name="teacher_selection"
              value={teacherSelection}
              onChange={(event) => setTeacherSelection(event.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            >
              <option value="">Select your teacher / homeroom</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.teacher_name}
                </option>
              ))}
              <option value="__other__">Other / not listed</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-bold text-slate-800">
              If not listed, enter teacher / homeroom here
            </label>
            <Input
              name="teacher_other"
              value={teacherOther}
              onChange={(event) => setTeacherOther(event.target.value)}
              placeholder="Example: The Caitlins"
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-indigo-300 bg-indigo-50 p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-indigo-950">
            Step 2: How many clubs would you like?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-900">
            Choose 0 if you do not want to be in clubs this session. Most students
            who want clubs should choose <span className="font-bold">1 club</span>.
            Choose 2 or 3 only if you would be happy being in more clubs. We
            will not match you with more clubs than you choose here.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <MaxClubButton
            value="0"
            selected={maxClubs === '0'}
            onClick={() => handleMaxClubsChange('0')}
          />
          <MaxClubButton
            value="1"
            selected={maxClubs === '1'}
            onClick={() => handleMaxClubsChange('1')}
          />
          <MaxClubButton
            value="2"
            selected={maxClubs === '2'}
            onClick={() => handleMaxClubsChange('2')}
          />
          <MaxClubButton
            value="3"
            selected={maxClubs === '3'}
            onClick={() => handleMaxClubsChange('3')}
          />
        </div>

        {wantsNoClubs ? (
          <div className="mt-4 rounded-2xl border border-slate-400 bg-white p-4 text-sm font-semibold text-slate-800">
            You chose 0 clubs. You can submit without rating clubs or choosing a
            #1 choice.
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">
            Step 3: Tell us about each club
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {wantsNoClubs
              ? 'You chose 0 clubs, so this section is optional.'
              : 'Please choose one answer for every club.'}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ChoiceExplainerCard
              title="Do not place me here"
              description="You will not be matched to this club."
              tone="slate"
            />
            <ChoiceExplainerCard
              title="I would try this"
              description="You might be matched to one of these clubs if there is room."
              tone="blue"
            />
            <ChoiceExplainerCard
              title="I really want this"
              description="We’ll try hard to match you with at least one club you really want."
              tone="green"
            />
          </div>
        </div>

        {clubs.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-slate-600">
            There are no club choices available right now.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {clubs.map((club, index) => (
              <ClubCard
                key={club.id}
                club={club}
                index={index}
                selectedInterest={interests[club.id]}
                onSelectInterest={(value) => setClubInterest(club.id, value)}
                disabled={wantsNoClubs}
              />
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border-2 border-yellow-400 bg-yellow-50 p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-yellow-950">
            Step 4: Pick your #1 choice
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-yellow-900">
            {wantsNoClubs
              ? 'You chose 0 clubs, so you do not need to pick a #1 choice.'
              : 'If you could get one club more than any other, which would you choose? We’ll try hardest to match you with this club.'}
          </p>
        </div>

        <select
          name="top_choice_club_id"
          value={wantsNoClubs ? '' : topChoice}
          onChange={(event) => setTopChoice(event.target.value)}
          className="w-full rounded-2xl border border-yellow-500 bg-white px-4 py-3 text-sm md:max-w-xl"
          required={!wantsNoClubs}
          disabled={wantsNoClubs}
        >
          <option value="">
            {wantsNoClubs ? 'No #1 choice needed' : 'Choose your #1 choice'}
          </option>
          {topChoiceOptions.map((club) => (
            <option key={club.id} value={club.id}>
              {displayClubName(club)}
            </option>
          ))}
        </select>

        {!wantsNoClubs && topChoiceOptions.length === 0 ? (
          <p className="mt-3 text-sm font-semibold text-orange-800">
            Choose “I would try this” or “I really want this” for at least one
            club before picking your #1 choice.
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border-2 border-blue-700 bg-blue-50 p-6 shadow-sm">
        <h2 className="text-2xl font-black text-blue-950">
          Ready to send your choices?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-900">
          {wantsNoClubs
            ? 'You chose 0 clubs. When you press submit, we will ask you to confirm that you do not want to be matched to clubs this session.'
            : 'Make sure you picked an answer for each club and chose your #1 choice. When you are done, press the big button below.'}
        </p>

        <div className="mt-5">
          <Button
            type="submit"
            disabled={!canSubmit}
            className={
              canSubmit
                ? 'rounded-2xl bg-blue-800 px-8 py-5 text-lg font-black text-white shadow-md hover:bg-blue-900'
                : 'cursor-not-allowed rounded-2xl bg-slate-300 px-8 py-5 text-lg font-black text-slate-600 shadow-sm'
            }
          >
            {canSubmit ? 'Send my club choices' : 'Finish all steps to submit'}
          </Button>
        </div>

        {!canSubmit ? (
          <p className="mt-3 text-sm font-bold text-orange-800">
            {missingMessage}
          </p>
        ) : wantsNoClubs ? (
          <p className="mt-3 text-sm font-bold text-slate-800">
            You selected 0 clubs. Press submit when you are sure.
          </p>
        ) : (
          <p className="mt-3 text-sm font-bold text-blue-950">
            Everything is ready. Press the button to send your choices.
          </p>
        )}

        <p className="mt-3 text-sm font-semibold text-blue-950">
          We can’t promise every choice, but your answers help us make the best
          match we can.
        </p>
      </section>
    </form>
  );
}