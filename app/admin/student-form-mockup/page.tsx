'use client';

import { useMemo, useState } from 'react';

type InterestValue = 'not_interested' | 'would_try' | 'really_want';
type MaxClubs = '1' | '2' | '3';

type MockClub = {
  id: string;
  title: string;
  category: string;
  description: string;
  meetingDays: string[];
  sponsor: string;
  color: 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'teal' | 'yellow';
};

const clubs: MockClub[] = [
  {
    id: 'art-club',
    title: 'Art Club',
    category: 'Creative',
    description:
      'Draw, paint, craft, and make creative projects with other students.',
    meetingDays: ['Monday'],
    sponsor: 'Ms. Rivera',
    color: 'purple',
  },
  {
    id: 'robotics',
    title: 'Robotics',
    category: 'STEM',
    description: 'Build, code, test ideas, and solve challenges with robots.',
    meetingDays: ['Tuesday'],
    sponsor: 'Mr. Chen',
    color: 'blue',
  },
  {
    id: 'sports-games',
    title: 'Sports & Games',
    category: 'Active',
    description:
      'Move, play team games, and try fun activities in the gym or outside.',
    meetingDays: ['Wednesday'],
    sponsor: 'Coach Lee',
    color: 'green',
  },
  {
    id: 'board-games',
    title: 'Board Games',
    category: 'Games',
    description:
      'Play strategy games, card games, and learn new games with friends.',
    meetingDays: ['Thursday'],
    sponsor: 'Ms. Patel',
    color: 'orange',
  },
  {
    id: 'book-club',
    title: 'Book Club',
    category: 'Reading',
    description: 'Read, talk about stories, and discover new favorite books.',
    meetingDays: ['Monday'],
    sponsor: 'Mr. Johnson',
    color: 'teal',
  },
  {
    id: 'drama-club',
    title: 'Drama Club',
    category: 'Performance',
    description: 'Play theater games, act out scenes, and practice performing.',
    meetingDays: ['Friday'],
    sponsor: 'Ms. King',
    color: 'pink',
  },
];

function colorClasses(color: MockClub['color']) {
  if (color === 'purple') {
    return {
      card: 'border-purple-300 bg-purple-50',
      header: 'bg-purple-700 text-white',
      badge: 'border-purple-300 bg-purple-100 text-purple-950',
    };
  }

  if (color === 'blue') {
    return {
      card: 'border-blue-300 bg-blue-50',
      header: 'bg-blue-700 text-white',
      badge: 'border-blue-300 bg-blue-100 text-blue-950',
    };
  }

  if (color === 'green') {
    return {
      card: 'border-green-300 bg-green-50',
      header: 'bg-green-700 text-white',
      badge: 'border-green-300 bg-green-100 text-green-950',
    };
  }

  if (color === 'orange') {
    return {
      card: 'border-orange-300 bg-orange-50',
      header: 'bg-orange-600 text-white',
      badge: 'border-orange-300 bg-orange-100 text-orange-950',
    };
  }

  if (color === 'pink') {
    return {
      card: 'border-pink-300 bg-pink-50',
      header: 'bg-pink-700 text-white',
      badge: 'border-pink-300 bg-pink-100 text-pink-950',
    };
  }

  if (color === 'teal') {
    return {
      card: 'border-teal-300 bg-teal-50',
      header: 'bg-teal-700 text-white',
      badge: 'border-teal-300 bg-teal-100 text-teal-950',
    };
  }

  return {
    card: 'border-yellow-300 bg-yellow-50',
    header: 'bg-yellow-500 text-yellow-950',
    badge: 'border-yellow-300 bg-yellow-100 text-yellow-950',
  };
}

function interestLabel(value: InterestValue) {
  if (value === 'not_interested') return 'Do not place me here';
  if (value === 'would_try') return 'I would try this';
  return 'I really want this';
}

function interestTone(value: InterestValue) {
  if (value === 'not_interested') {
    return 'border-slate-700 bg-slate-500 text-white';
  }

  if (value === 'would_try') {
    return 'border-blue-600 bg-blue-700 text-white';
  }

  return 'border-green-600 bg-green-700 text-white';
}

function StepPill({
  number,
  title,
}: {
  number: number;
  title: string;
}) {
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
          : 'rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 shadow-sm hover:border-blue-500 hover:bg-blue-50'
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
          ? 'rounded-2xl border-2 border-indigo-800 bg-indigo-700 px-5 py-4 text-left text-white shadow-sm'
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
        {value === '1'
          ? 'Best choice for most students.'
          : value === '2'
            ? 'Choose this if you would be happy with two clubs.'
            : 'Choose this only if you would be happy with three clubs.'}
      </div>
    </button>
  );
}

function ClubCard({
  club,
  selectedInterest,
  onSelectInterest,
}: {
  club: MockClub;
  selectedInterest: InterestValue | undefined;
  onSelectInterest: (value: InterestValue) => void;
}) {
  const colors = colorClasses(club.color);

  return (
    <div className={`overflow-hidden rounded-3xl border-2 shadow-sm ${colors.card}`}>
      <div className={`px-5 py-3 ${colors.header}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-black">{club.title}</h3>
            <div className="mt-1 text-sm opacity-90">
              {club.category} · {club.meetingDays.join(', ')}
            </div>
          </div>

          <div className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
            Club leader: {club.sponsor}
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-sm leading-6 text-slate-800">{club.description}</p>

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
      </div>
    </div>
  );
}

export default function StudentFormMockupPage() {
  const [studentName, setStudentName] = useState('Jane Student');
  const [grade, setGrade] = useState('4');
  const [teacher, setTeacher] = useState('Ms. Smith');
  const [maxClubs, setMaxClubs] = useState<MaxClubs>('1');
  const [topChoice, setTopChoice] = useState('');
  const [interests, setInterests] = useState<Record<string, InterestValue>>({});

  const ratedCount = Object.keys(interests).length;

  const reallyWantClubs = useMemo(
    () => clubs.filter((club) => interests[club.id] === 'really_want'),
    [interests]
  );

  const wouldTryClubs = useMemo(
    () => clubs.filter((club) => interests[club.id] === 'would_try'),
    [interests]
  );

  const topChoiceOptions =
    reallyWantClubs.length > 0
      ? reallyWantClubs
      : [...reallyWantClubs, ...wouldTryClubs];

  function setClubInterest(clubId: string, value: InterestValue) {
    setInterests((current) => ({
      ...current,
      [clubId]: value,
    }));

    if (value === 'not_interested' && topChoice === clubId) {
      setTopChoice('');
    }
  }

  function handleMockSubmit() {
    window.alert(
      'Mock submission only — nothing was saved. This is just for testing the student-friendly design.'
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 p-4 md:p-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-emerald-1       00 via-sky-50 to-violet-100 p-7 shadow-sm">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-sky-100/80" />
        <div className="absolute bottom-0 left-0 h-24 w-40 rounded-tr-full bg-emerald-100/80" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
            <div className="inline-flex rounded-full border border-sky-300 bg-white/80 px-3 py-1 text-sm font-black uppercase tracking-wide text-sky-900">
                Student mockup
            </div>

            <h1 className="mt-4 text-4xl font-black text-slate-950">
                Club Sign-Up
            </h1>

            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-slate-700">
                Tell us which clubs sound good to you. Your choices help us build
                your club schedule. There are no wrong answers.
            </p>
            </div>

            <div className="rounded-2xl border-2 border-sky-200 bg-white/85 p-4 text-sm text-slate-800 shadow-sm">
            <div className="font-black text-slate-950">Progress</div>
            <div className="mt-2">
                {ratedCount} of {clubs.length} clubs rated
            </div>

            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                className="h-full rounded-full bg-sky-500"
                style={{
                    width: `${Math.round((ratedCount / clubs.length) * 100)}%`,
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
              Your name
            </label>
            <input
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              placeholder="Type your name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-800">
              Grade
            </label>
            <select
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option value="3">Grade 3</option>
              <option value="4">Grade 4</option>
              <option value="5">Grade 5</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-800">
              Classroom / teacher
            </label>
            <select
              value={teacher}
              onChange={(event) => setTeacher(event.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            >
              <option>Ms. Smith</option>
              <option>Mr. Johnson</option>
              <option>Ms. Rivera</option>
              <option>Mr. Chen</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border-2 border-indigo-300 bg-indigo-50 p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-indigo-950">
            Step 2: How many clubs would you like?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-900">
            Most students will get <span className="font-bold">1 club</span>.
            Choose 2 or 3 only if you would be happy being in more clubs this
            session. We will not match you with more clubs than you choose here.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <MaxClubButton
            value="1"
            selected={maxClubs === '1'}
            onClick={() => setMaxClubs('1')}
          />
          <MaxClubButton
            value="2"
            selected={maxClubs === '2'}
            onClick={() => setMaxClubs('2')}
          />
          <MaxClubButton
            value="3"
            selected={maxClubs === '3'}
            onClick={() => setMaxClubs('3')}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-950">
            Step 3: Tell us about each club
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            For each club, choose the option that best matches what you want.
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

        <div className="grid gap-5 lg:grid-cols-2">
          {clubs.map((club) => (
            <ClubCard
              key={club.id}
              club={club}
              selectedInterest={interests[club.id]}
              onSelectInterest={(value) => setClubInterest(club.id, value)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-3xl border-2 border-yellow-400 bg-yellow-50 p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-2xl font-black text-yellow-950">
            Step 4: Pick your #1 choice
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-yellow-900">
            If you could get one club more than any other, which would you
            choose? We’ll try hardest to match you with this club.
          </p>
        </div>

        <select
          value={topChoice}
          onChange={(event) => setTopChoice(event.target.value)}
          className="w-full rounded-2xl border border-yellow-500 bg-white px-4 py-3 text-sm md:max-w-xl"
        >
          <option value="">Choose your #1 choice</option>
          {topChoiceOptions.map((club) => (
            <option key={club.id} value={club.id}>
              {club.title}
            </option>
          ))}
        </select>

        {topChoiceOptions.length === 0 ? (
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
          Make sure you picked an answer for each club and chose your #1 choice.
          When you are done, press the big button below. Mockup only — nothing
          will be saved.
        </p>

        <div className="mt-5">
          <button
            type="button"
            onClick={handleMockSubmit}
            className="rounded-2xl bg-blue-800 px-8 py-5 text-lg font-black text-white shadow-md hover:bg-blue-900"
          >
            Send my club choices
          </button>
        </div>

        <p className="mt-3 text-sm font-semibold text-blue-950">
          We can’t promise every choice, but your answers help us make the best
          match we can.
        </p>
      </section>
    </div>
  );
}