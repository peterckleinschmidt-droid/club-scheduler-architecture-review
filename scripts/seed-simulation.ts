import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runMatching } from '../lib/matching/engine';

type Mode = 'reset' | 'seed' | 'seed-and-match';

type RuntimeConfig = {
  prefix: string;
  schoolYearId: string;
  actorUserId: string;
  blockCount: number;
  teacherCount: number;
  studentCount: number;
  minClubsPerBlock: number;
  maxClubsPerBlock: number;
  seed: number;
};

type TeacherRow = {
  id: string;
  teacher_name: string;
};

type StudentRow = {
  id: string;
  student_name: string;
  student_email: string;
  grade: number;
  teacher_id: string | null;
  teacher_homeroom_text: string;
};

type BlockRow = {
  id: string;
  label: string;
  school_year_id: string;
};

type ClubRow = {
  id: string;
  block_id: string;
  club_title: string;
  section_label: string | null;
  description: string | null;
  sponsor_name: string | null;
  leader_email: string | null;
  meeting_days: string[];
  capacity_type: 'limited' | 'unlimited';
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  minimum_applies_to: 'section' | 'title';
  grade_limited: boolean;
  eligible_grades: number[] | null;
  eligible_grade: number | null;
  matching_preference: 'highest_interest' | 'grade_balance';
  is_active: boolean;
  show_to_students: boolean;
};

type FinalizeParams = {
  blockId: string;
  actorUserId: string;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const GRADES = [3, 4, 5] as const;
const CLUB_THEMES = [
  'Robotics',
  'Art Studio',
  'Chess',
  'Gardening',
  'Running',
  'Craft Lab',
  'Coding',
  'Drama',
  'Board Games',
  'Creative Writing',
  'Soccer Skills',
  'STEM Lab',
  'Nature Explorers',
  'Music Makers',
  'Lego Builders',
  'Science Detectives',
  'Cooking Basics',
  'Kindness Club',
  'Book Club',
  'Photography',
  'Puzzles',
  'Community Helpers',
  'Outdoor Games',
  'Cartooning',
  'Dance Mix',
  'Maker Space',
  'Podcast Club',
  'Journalism',
  'Recess Games',
  'Origami',
  'Movie Making',
  'Bird Watching',
  'Yoga',
  'Poetry',
  'Knitting',
];
const LAST_NAMES = [
  'Adams',
  'Baker',
  'Carter',
  'Diaz',
  'Evans',
  'Foster',
  'Garcia',
  'Hayes',
  'Irwin',
  'Jones',
  'Kim',
  'Lopez',
  'Morris',
  'Nguyen',
  'Owens',
  'Patel',
  'Quinn',
  'Reed',
  'Singh',
  'Taylor',
];
const FIRST_NAMES = [
  'Avery',
  'Bailey',
  'Cameron',
  'Dakota',
  'Emerson',
  'Finley',
  'Gray',
  'Harper',
  'Indigo',
  'Jules',
  'Kai',
  'Logan',
  'Morgan',
  'Nova',
  'Oakley',
  'Parker',
  'Quinn',
  'Riley',
  'Sawyer',
  'Taylor',
  'Uma',
  'Vale',
  'Winter',
  'Yael',
  'Zion',
];
const SPONSOR_NAMES = [
  'Ms. Rivera',
  'Mr. Johnson',
  'Coach Patel',
  'Ms. Chen',
  'Mr. Gomez',
  'Ms. Larson',
  'Mr. Wright',
  'Mrs. Ahmed',
  'Ms. Baker',
  'Mr. Fields',
  'Community Volunteer',
  'Parent Volunteer',
  'Library Staff',
  'After School Team',
];

loadLocalEnv();

const mode = ((process.argv[2] || 'seed-and-match') as Mode);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).');
}

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let rng = mulberry32(intEnv('SIM_RANDOM_SEED', 20260602));

async function main() {
  const config = await buildRuntimeConfig();
  rng = mulberry32(config.seed);

  console.log(`Mode: ${mode}`);
  console.log(`School year ID: ${config.schoolYearId}`);
  console.log(`Actor user ID: ${config.actorUserId}`);
  console.log(`Seed: ${config.seed}`);

  if (mode === 'reset') {
    await resetSimulationData(supabase, config);
    console.log('Simulation data reset complete.');
    return;
  }

  await resetSimulationData(supabase, config);

  const teachers = await ensureTeachers(supabase, config);
  const students = await ensureStudents(supabase, config, teachers);
  const blocks = await createBlocks(supabase, config);

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    console.log(`\n--- Building ${block.label} (${i + 1}/${blocks.length}) ---`);

    await setCurrentBlock(supabase, config.schoolYearId, block.id);
    const clubs = await createClubsForBlock(supabase, config, block, i);
    await createStudentSubmissionsForBlock(
      supabase,
      config,
      block,
      students,
      clubs,
      i
    );

    if (mode === 'seed-and-match') {
      console.log(`Running initial match for ${block.label}...`);
      await runMatching(block.id, 'initial');
      await autoDecideBelowMinimum(supabase, config, block.id, 'initial');

      const cancelledCount = await countCancelledClubs(supabase, block.id);
      if (cancelledCount > 0) {
        console.log(
          `Running rematch after ${cancelledCount} cancellation(s)...`
        );
        await runMatching(block.id, 'rematch');
        await autoDecideBelowMinimum(supabase, config, block.id, 'rematch');
      }

      console.log(`Finalizing ${block.label}...`);
      await finalizeBlock(supabase, {
        blockId: block.id,
        actorUserId: config.actorUserId,
      });
    }
  }

  console.log('\nSimulation build complete.');
  console.log(`Blocks created: ${blocks.length}`);
  console.log(`Teachers created: ${teachers.length}`);
  console.log(`Students created: ${students.length}`);
  console.log(`Mode completed: ${mode}`);
}

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, 'utf8');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function buildRuntimeConfig(): Promise<RuntimeConfig> {
  const prefix = process.env.SIM_PREFIX || 'SIM';
  const schoolYearId =
    process.env.SIM_SCHOOL_YEAR_ID || (await detectLatestSchoolYearId());
  const actorUserId =
    process.env.SIM_ADMIN_USER_ID || (await detectAdminUserId());

  if (!schoolYearId) {
    throw new Error(
      [
        'Could not determine SIM_SCHOOL_YEAR_ID.',
        'Set SIM_SCHOOL_YEAR_ID in .env.local or ensure public.school_years has at least one row.',
      ].join(' ')
    );
  }

  if (!actorUserId) {
    throw new Error(
      [
        'Could not determine SIM_ADMIN_USER_ID.',
        'Set SIM_ADMIN_USER_ID in .env.local or ensure public.users has at least one row.',
      ].join(' ')
    );
  }

  return {
    prefix,
    schoolYearId,
    actorUserId,
    blockCount: intEnv('SIM_BLOCK_COUNT', 6),
    teacherCount: intEnv('SIM_TEACHER_COUNT', 15),
    studentCount: intEnv('SIM_STUDENT_COUNT', 250),
    minClubsPerBlock: intEnv('SIM_MIN_CLUBS', 15),
    maxClubsPerBlock: intEnv('SIM_MAX_CLUBS', 20),
    seed: intEnv('SIM_RANDOM_SEED', 20260602),
  };
}

function intEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

async function detectLatestSchoolYearId() {
  const attempts = [
    async () =>
      await supabase
        .from('school_years')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    async () =>
      await supabase
        .from('school_years')
        .select('id')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    async () =>
      await supabase.from('school_years').select('id').limit(1).maybeSingle(),
  ];

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt();
      if (!error && data?.id) {
        return String(data.id);
      }
    } catch {
      // try next strategy
    }
  }

  return '';
}

async function detectAdminUserId() {
  const attempts = [
    async () =>
      await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle(),
    async () =>
      await supabase.from('users').select('id').limit(1).maybeSingle(),
  ];

  for (const attempt of attempts) {
    try {
      const { data, error } = await attempt();
      if (!error && data?.id) {
        return String(data.id);
      }
    } catch {
      // try next strategy
    }
  }

  return '';
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rand() {
  return rng();
}

function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function chance(probability: number) {
  return rand() < probability;
}

function pickOne<T>(items: readonly T[]) {
  return items[randInt(0, items.length - 1)];
}

function pickManyUnique<T>(items: readonly T[], count: number) {
  const copy = [...items];
  const out: T[] = [];
  while (copy.length > 0 && out.length < count) {
    const index = randInt(0, copy.length - 1);
    out.push(copy.splice(index, 1)[0]);
  }
  return out;
}

function simulationTeacherName(prefix: string, index: number) {
  const lastName = LAST_NAMES[index % LAST_NAMES.length];
  const room = index + 1;
  return `${prefix} Homeroom ${room} - ${lastName}`;
}

function simulationStudentName(prefix: string, index: number) {
  const first = FIRST_NAMES[index % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${prefix} ${first} ${last} ${String(index + 1).padStart(3, '0')}`;
}

function simulationStudentEmail(prefix: string, index: number) {
  return `${prefix.toLowerCase()}.student.${String(index + 1).padStart(3, '0')}@sim.local`;
}

function simulationBlockLabel(prefix: string, index: number) {
  return `${prefix} Block ${index + 1}`;
}

function simulationClubTitle(prefix: string, theme: string) {
  return `${prefix} ${theme}`;
}

function token() {
  return randomBytes(16).toString('hex');
}

function maxClubsFromPreference(preference: 'none' | 'one' | 'two' | 'three') {
  if (preference === 'none') return 0;
  if (preference === 'one') return 1;
  if (preference === 'two') return 2;
  return 3;
}

function interestLabelFromScore(score: number) {
  if (score === 0) return 'not_interested';
  if (score === 1) return 'a_little_interested';
  if (score === 2) return 'very_interested';
  if (score === 3) return 'extremely_interested';
  return 'not_interested';
}

async function resetSimulationData(s: SupabaseClient, cfg: RuntimeConfig) {
  console.log('Resetting prior simulation data...');

  const { data: simBlocks, error: blockLoadError } = await s
    .from('blocks')
    .select('id,label')
    .eq('school_year_id', cfg.schoolYearId)
    .ilike('label', `${cfg.prefix} Block %`);

  if (blockLoadError) {
    throw new Error(`Could not load simulation blocks: ${blockLoadError.message}`);
  }

  const blockIds = (simBlocks ?? []).map((row: any) => row.id);

  if (blockIds.length > 0) {
    const matchRunIds = await matchRunIdsForBlocks(s, blockIds);

    const { data: snapshots, error: snapshotLoadError } = await s
      .from('history_snapshots')
      .select('id')
      .in('block_id', blockIds);

    if (snapshotLoadError) {
      throw new Error(`Could not load history snapshots: ${snapshotLoadError.message}`);
    }

    const snapshotIds = (snapshots ?? []).map((row: any) => row.id);

    const { data: submissions, error: submissionLoadError } = await s
      .from('student_submissions')
      .select('id')
      .in('block_id', blockIds);

    if (submissionLoadError) {
      throw new Error(`Could not load student submissions: ${submissionLoadError.message}`);
    }

    const submissionIds = (submissions ?? []).map((row: any) => row.id);

    if (snapshotIds.length > 0) {
      await mustSucceed(
        s.from('history_student_outcomes').delete().in('history_snapshot_id', snapshotIds),
        'Could not delete history student outcomes'
      );
    }

    await mustSucceed(
      s.from('final_assignments').delete().in('block_id', blockIds),
      'Could not delete final assignments'
    );

    if (matchRunIds.length > 0) {
      await mustSucceed(
        s.from('draft_assignments').delete().in('match_run_id', matchRunIds),
        'Could not delete draft assignments'
      );

      await mustSucceed(
        s.from('match_demand_summaries').delete().in('match_run_id', matchRunIds),
        'Could not delete match demand summaries'
      );
    }

    await mustSucceed(
      s.from('below_minimum_decisions').delete().in('block_id', blockIds),
      'Could not delete below-minimum decisions'
    );

    if (submissionIds.length > 0) {
  await deleteInChunks({
    s,
    table: 'student_interest_ratings',
    column: 'student_submission_id',
    values: submissionIds,
    message: 'Could not delete student interest ratings',
     });
    }

    await mustSucceed(
      s.from('student_submissions').delete().in('block_id', blockIds),
      'Could not delete student submissions'
    );

    if (snapshotIds.length > 0) {
      await mustSucceed(
        s.from('history_snapshots').delete().in('id', snapshotIds),
        'Could not delete history snapshots'
      );
    }

    if (matchRunIds.length > 0) {
      await mustSucceed(
        s.from('match_runs').delete().in('id', matchRunIds),
        'Could not delete match runs'
      );
    }

    await mustSucceed(
      s.from('club_offerings').delete().in('block_id', blockIds),
      'Could not delete club offerings'
    );

    await mustSucceed(
      s.from('blocks').delete().in('id', blockIds),
      'Could not delete blocks'
    );
  }

await mustSucceed(
  s
    .from('students')
    .delete()
    .eq('school_year_id', cfg.schoolYearId)
    .ilike('student_email', `${cfg.prefix.toLowerCase()}.student.%@sim.local`),
  'Could not delete simulation students for this school year'
);


// Do not delete simulation teachers during reset.
// Teachers / homerooms are intentionally reusable across school years,
// and archived students may still reference them.

//  await mustSucceed(
//    s.from('teachers').delete().ilike('teacher_name', `${cfg.prefix} Homeroom %`),
//    'Could not delete simulation teachers'
 // );
}

async function matchRunIdsForBlocks(s: SupabaseClient, blockIds: string[]) {
  if (blockIds.length === 0) return [] as string[];

  const { data, error } = await s
    .from('match_runs')
    .select('id')
    .in('block_id', blockIds);

  if (error) {
    throw new Error(`Could not load match runs: ${error.message}`);
  }

  return (data ?? []).map((row: any) => String(row.id));
}

async function ensureTeachers(s: SupabaseClient, cfg: RuntimeConfig) {
  const desiredNames = Array.from({ length: cfg.teacherCount }, (_, index) =>
    simulationTeacherName(cfg.prefix, index)
  );

  const { data: existingTeachers = [], error: existingError } = await s
    .from('teachers')
    .select('id, teacher_name')
    .in('teacher_name', desiredNames);

  if (existingError) {
    throw new Error(`Could not load existing teachers: ${existingError.message}`);
  }

  const existingByName = new Map(
    (existingTeachers as TeacherRow[]).map((teacher) => [
      teacher.teacher_name,
      teacher,
    ])
  );

  const missingRows = desiredNames
    .filter((teacherName) => !existingByName.has(teacherName))
    .map((teacherName) => ({
      teacher_name: teacherName,
    }));

  if (missingRows.length > 0) {
    const { error: insertError } = await s.from('teachers').insert(missingRows);

    if (insertError) {
      throw new Error(`Could not create teachers: ${insertError.message}`);
    }
  }

  const { data: finalTeachers = [], error: finalError } = await s
    .from('teachers')
    .select('id, teacher_name')
    .in('teacher_name', desiredNames)
    .order('teacher_name', { ascending: true });

  if (finalError) {
    throw new Error(`Could not reload teachers: ${finalError.message}`);
  }

  return finalTeachers as TeacherRow[];
}

async function ensureStudents(
  s: SupabaseClient,
  cfg: RuntimeConfig,
  teachers: TeacherRow[]
) {
  const rows = Array.from({ length: cfg.studentCount }, (_, index) => {
    const grade = GRADES[index % GRADES.length];
    const teacher = teachers[index % teachers.length] ?? null;

    return {
      school_year_id: cfg.schoolYearId,
      student_email: simulationStudentEmail(cfg.prefix, index),
      student_name: simulationStudentName(cfg.prefix, index),
      grade,
      teacher_id: teacher?.id ?? null,
      teacher_homeroom_text: teacher?.teacher_name ?? `${cfg.prefix} Homeroom`,
      is_active: true,
      linked_user_id: null,
    };
  });

  const { data, error } = await s
    .from('students')
    .insert(rows)
    .select('id, student_name, student_email, grade, teacher_id, teacher_homeroom_text, school_year_id');

  if (error) {
    throw new Error(`Could not create students: ${error.message}`);
  }

  return (data ?? []) as StudentRow[];
}

async function createBlocks(s: SupabaseClient, cfg: RuntimeConfig) {
  const rows = Array.from({ length: cfg.blockCount }, (_, index) => ({
    school_year_id: cfg.schoolYearId,
    label: simulationBlockLabel(cfg.prefix, index),
    is_current: false,
    status: 'matching',
    teacher_offerings_open: false,
    student_form_open: false,
    public_club_submission_open: false,
    public_club_submission_token: token(),
    matching_locked: false,
  }));

  const { data, error } = await s
    .from('blocks')
    .insert(rows)
    .select('id, label, school_year_id');

  if (error) {
    throw new Error(`Could not create blocks: ${error.message}`);
  }

  return (data ?? []) as BlockRow[];
}

async function setCurrentBlock(s: SupabaseClient, schoolYearId: string, blockId: string) {
  await mustSucceed(
    s.from('blocks').update({ is_current: false }).eq('school_year_id', schoolYearId),
    'Could not clear current block'
  );

  await mustSucceed(
    s.from('blocks').update({ is_current: true }).eq('id', blockId),
    'Could not set current block'
  );
}

async function createClubsForBlock(
  s: SupabaseClient,
  cfg: RuntimeConfig,
  block: BlockRow,
  blockIndex: number
) {
  const clubCount = randInt(cfg.minClubsPerBlock, cfg.maxClubsPerBlock);
  const themes = pickManyUnique(CLUB_THEMES, clubCount);

  const rows = themes.map((theme, index) => {
    const limited = chance(0.82);
    const minimum = chance(0.72) ? randInt(4, 10) : 0;
    const maxCapacity = limited ? randInt(Math.max(6, minimum + 2), 24) : null;
    const meetingDays = pickManyUnique(DAYS, chance(0.18) ? 2 : 1);
    const gradeLimited = chance(0.28);
    const eligibleGrades = gradeLimited
      ? pickManyUnique(GRADES, chance(0.22) ? 2 : 1).sort((a, b) => a - b)
      : null;

    return {
      block_id: block.id,
      club_title: simulationClubTitle(cfg.prefix, theme),
      section_label: chance(0.38)
        ? pickOne(['Mondays', 'Tuesdays', 'Wednesdays', 'Third Grade', 'Section A'])
        : null,
      description: `${theme} activities for ${block.label}.`,
      sponsor_name: pickOne(SPONSOR_NAMES),
      leader_email: `${theme.toLowerCase().replace(/\s+/g, '.')}.${blockIndex + 1}@sim.local`,
      meeting_days: meetingDays,
      capacity_type: limited ? 'limited' : 'unlimited',
      max_capacity: limited ? maxCapacity : null,
      minimum_viable_enrollment: minimum,
      minimum_applies_to: chance(0.7) ? 'section' : 'title',
      grade_limited: gradeLimited,
      eligible_grades: eligibleGrades,
      eligible_grade: eligibleGrades && eligibleGrades.length === 1 ? eligibleGrades[0] : null,
      matching_preference: chance(0.24) ? 'grade_balance' : 'highest_interest',
      is_active: true,
      show_to_students: true,
      submitted_by_user_id: cfg.actorUserId,
      public_edit_token: token(),
    };
  });

  const { data, error } = await s.from('club_offerings').insert(rows).select('*');

  if (error) {
    throw new Error(`Could not create clubs for ${block.label}: ${error.message}`);
  }

  return (data ?? []) as ClubRow[];
}

async function createStudentSubmissionsForBlock(
  s: SupabaseClient,
  cfg: RuntimeConfig,
  block: BlockRow,
  students: StudentRow[],
  clubs: ClubRow[],
  blockIndex: number
) {
  const popularityByClub = new Map<string, number>();
  for (const club of clubs) {
    popularityByClub.set(club.id, randInt(20, 95));
  }

  const submissionRows: Array<{
    block_id: string;
    student_id: string;
    submitted_by_user_id: string;
    participation_preference: 'none' | 'one' | 'two' | 'three';
    max_clubs: number;
    top_choice_club_id: string | null;
    is_latest: boolean;
  }> = [];

  const ratingsByStudentId = new Map<
    string,
    Array<{
      club_offering_id: string;
      interest_level: string;
      interest_score: number;
    }>
  >();

  for (const student of students) {
    const preference = chooseParticipationPreference(student.grade, blockIndex);
    const maxClubs = maxClubsFromPreference(preference);

    const scored = clubs.map((club) => {
      const eligibleGrades = Array.isArray(club.eligible_grades)
        ? club.eligible_grades
        : [];

      const isEligible =
        !club.grade_limited ||
        eligibleGrades.includes(student.grade) ||
        club.eligible_grade === student.grade;

      if (!isEligible) {
        return { club, score: 0 };
      }

      const themePopularity = popularityByClub.get(club.id) ?? 50;
      const gradeAffinity =
        club.matching_preference === 'grade_balance'
          ? Math.max(0, 3 - Math.abs(student.grade - 4)) * 6
          : 0;
      const dayBonus = club.meeting_days.length > 1 ? 4 : 0;
      const randomNoise = randInt(-15, 20);
      const raw = themePopularity + gradeAffinity + dayBonus + randomNoise;

      let score = 0;
      if (raw >= 85) score = 3;
      else if (raw >= 65) score = 2;
      else if (raw >= 45) score = 1;

      if (chance(0.08)) score = 0;
      if (chance(0.06)) score = Math.min(3, score + 1);

      return { club, score };
    });

    if (maxClubs === 0) {
      for (const item of scored) {
        item.score = chance(0.12) ? randInt(1, 2) : 0;
      }
    }

    const positive = [...scored]
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || randInt(-1, 1));

    submissionRows.push({
      block_id: block.id,
      student_id: student.id,
      submitted_by_user_id: cfg.actorUserId,
      participation_preference: preference,
      max_clubs: maxClubs,
      top_choice_club_id: positive.length > 0 ? positive[0].club.id : null,
      is_latest: true,
    });

    ratingsByStudentId.set(
      student.id,
      scored.map((item) => ({
        club_offering_id: item.club.id,
        interest_level: interestLabelFromScore(item.score),
        interest_score: item.score,
      }))
    );
  }

  const { data: submissions, error: submissionsError } = await s
    .from('student_submissions')
    .insert(submissionRows)
    .select('id, student_id');

  if (submissionsError) {
    throw new Error(
      `Could not create student submissions for ${block.label}: ${submissionsError.message}`
    );
  }

  const submissionIdByStudentId = new Map<string, string>();
  for (const row of submissions ?? []) {
    submissionIdByStudentId.set(String((row as any).student_id), String((row as any).id));
  }

  const ratingsRows: any[] = [];
  for (const [studentId, ratings] of ratingsByStudentId.entries()) {
    const submissionId = submissionIdByStudentId.get(studentId);
    if (!submissionId) continue;

    for (const rating of ratings) {
      ratingsRows.push({
        student_submission_id: submissionId,
        club_offering_id: rating.club_offering_id,
        interest_level: rating.interest_level,
        interest_score: rating.interest_score,
      });
    }
  }

  if (ratingsRows.length > 0) {
    const { error: ratingsError } = await s
      .from('student_interest_ratings')
      .insert(ratingsRows);

    if (ratingsError) {
      throw new Error(
        `Could not create student interest ratings for ${block.label}: ${ratingsError.message}`
      );
    }
  }
}

function chooseParticipationPreference(grade: number, blockIndex: number) {
  const roll = rand();

  if (blockIndex > 2) {
    if (roll < 0.08) return 'none';
    if (roll < 0.4) return 'one';
    if (roll < 0.82) return 'two';
    return 'three';
  }

  if (grade === 3) {
    if (roll < 0.1) return 'none';
    if (roll < 0.45) return 'one';
    if (roll < 0.84) return 'two';
    return 'three';
  }

  if (grade === 4) {
    if (roll < 0.07) return 'none';
    if (roll < 0.3) return 'one';
    if (roll < 0.76) return 'two';
    return 'three';
  }

  if (roll < 0.06) return 'none';
  if (roll < 0.26) return 'one';
  if (roll < 0.7) return 'two';
  return 'three';
}

async function autoDecideBelowMinimum(
  s: SupabaseClient,
  cfg: RuntimeConfig,
  blockId: string,
  runType: 'initial' | 'rematch'
) {
  const { data: run, error: runError } = await s
    .from('match_runs')
    .select('*')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    throw new Error(`Could not load completed run: ${runError.message}`);
  }

  if (!run) return;

    const { data: belowData = [], error: belowError } = await s
      .from('match_demand_summaries')
      .select('*, club_offerings(*)')
      .eq('match_run_id', run.id)
      .eq('below_minimum', true);

    if (belowError) {
      throw new Error(`Could not load below-minimum clubs: ${belowError.message}`);
    }

    const belowRows = (belowData ?? []) as any[];

    if (belowRows.length === 0) return;

    const decisionRows = belowRows.map((row) => {
    const minimum = Number(row.club_offerings?.minimum_viable_enrollment ?? 0);
    const assigned = Number(row.assigned_count ?? 0);
    const veryLowDemand = assigned <= Math.max(1, Math.floor(minimum * 0.4));

    const decision = runType === 'initial' && veryLowDemand ? 'cancel' : 'force_run';
    const notes =
      decision === 'cancel'
        ? `Simulation auto-cancel: assigned ${assigned} of minimum ${minimum}.`
        : `Simulation auto-force-run: assigned ${assigned} of minimum ${minimum}.`;

    return {
      block_id: blockId,
      club_offering_id: row.club_offering_id,
      decision,
      decided_by_user_id: cfg.actorUserId,
      notes,
      decided_at: new Date().toISOString(),
    };
  });

  const { error: decisionError } = await s
    .from('below_minimum_decisions')
    .upsert(decisionRows, { onConflict: 'block_id,club_offering_id' });

  if (decisionError) {
    throw new Error(`Could not save below-minimum decisions: ${decisionError.message}`);
  }
}

async function countCancelledClubs(s: SupabaseClient, blockId: string) {
  const { data, error } = await s
    .from('below_minimum_decisions')
    .select('club_offering_id')
    .eq('block_id', blockId)
    .eq('decision', 'cancel');

  if (error) {
    throw new Error(`Could not count cancelled clubs: ${error.message}`);
  }

  return (data ?? []).length;
}

async function finalizeBlock(s: SupabaseClient, params: FinalizeParams) {
  const { blockId, actorUserId } = params;

  const { data: block, error: blockError } = await s
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .single();

  if (blockError || !block) {
    throw new Error(
      `Could not load block during finalize: ${blockError?.message ?? 'Not found'}`
    );
  }

  const { data: run, error: runError } = await s
    .from('match_runs')
    .select('*')
    .eq('block_id', blockId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (runError || !run) {
    throw new Error(
      `Could not load completed run during finalize: ${runError?.message ?? 'Not found'}`
    );
  }

 const { data: belowData = [], error: belowError } = await s
    .from('match_demand_summaries')
    .select('*')
    .eq('match_run_id', run.id)
    .eq('below_minimum', true);

  if (belowError) {
    throw new Error(`Could not load below-minimum summaries: ${belowError.message}`);
  }

  const { data: decisionsData = [], error: decisionsError } = await s
    .from('below_minimum_decisions')
    .select('*')
    .eq('block_id', blockId);

  if (decisionsError) {
    throw new Error(`Could not load below-minimum decisions: ${decisionsError.message}`);
  }

  const belowRows = (belowData ?? []) as any[];
  const decisionRows = (decisionsData ?? []) as any[];

  const decided = new Set(
    decisionRows.map((row) => row.club_offering_id)
  );

  if (belowRows.some((row) => !decided.has(row.club_offering_id))) {
    throw new Error(`Finalize blocked for ${block.label}: missing below-minimum decisions.`);
  }

  const cancelled = new Set(
    decisionRows
      .filter((row) => row.decision === 'cancel')
      .map((row) => row.club_offering_id)
  );

  const { data: drafts = [], error: draftsError } = await s
    .from('draft_assignments')
    .select('*')
    .eq('match_run_id', run.id);

  if (draftsError) {
    throw new Error(`Could not load draft assignments: ${draftsError.message}`);
  }

  const finalRows = (drafts as any[])
    .filter((draft) => !cancelled.has(draft.club_offering_id))
    .map((draft) => ({
      block_id: blockId,
      student_id: draft.student_id,
      club_offering_id: draft.club_offering_id,
      finalized_by_user_id: actorUserId,
    }));

  if (finalRows.length > 0) {
    const { error: finalError } = await s
      .from('final_assignments')
      .upsert(finalRows, { onConflict: 'block_id,student_id,club_offering_id' });

    if (finalError) {
      throw new Error(`Could not create final assignments: ${finalError.message}`);
    }
  }

  await createOrRefreshHistorySnapshot(s, {
    blockId,
    schoolYearId: block.school_year_id,
    actorUserId,
  });

  const { error: blockUpdateError } = await s
    .from('blocks')
    .update({
      status: 'finalized',
      matching_locked: true,
      teacher_offerings_open: false,
      student_form_open: false,
      public_club_submission_open: false,
      finalized_at: new Date().toISOString(),
    })
    .eq('id', blockId);

  if (blockUpdateError) {
    throw new Error(`Could not update finalized block: ${blockUpdateError.message}`);
  }
}

async function createOrRefreshHistorySnapshot(
  s: SupabaseClient,
  params: { blockId: string; schoolYearId: string; actorUserId: string }
) {
  const { blockId, schoolYearId, actorUserId } = params;

  const { data: existingSnapshot, error: existingSnapshotError } = await s
    .from('history_snapshots')
    .select('*')
    .eq('block_id', blockId)
    .maybeSingle();

  if (existingSnapshotError) {
    throw new Error(
      `Could not load existing history snapshot: ${existingSnapshotError.message}`
    );
  }

  let snapshotId = existingSnapshot?.id as string | undefined;

  if (snapshotId) {
    await mustSucceed(
      s.from('history_student_outcomes').delete().eq('history_snapshot_id', snapshotId),
      'Could not clear prior history outcomes'
    );

    await mustSucceed(
      s
        .from('history_snapshots')
        .update({
          committed_by_user_id: actorUserId,
          committed_at: new Date().toISOString(),
        })
        .eq('id', snapshotId),
      'Could not refresh history snapshot'
    );
  } else {
    const { data: newSnapshot, error: snapshotError } = await s
      .from('history_snapshots')
      .insert({
        block_id: blockId,
        school_year_id: schoolYearId,
        committed_by_user_id: actorUserId,
        committed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (snapshotError || !newSnapshot) {
      throw new Error(
        `Could not create history snapshot: ${snapshotError?.message ?? 'Unknown error'}`
      );
    }

    snapshotId = newSnapshot.id;
  }

  const { data: submissions = [], error: submissionsError } = await s
    .from('student_submissions')
    .select('*')
    .eq('block_id', blockId)
    .eq('is_latest', true);

  if (submissionsError) {
    throw new Error(`Could not load latest submissions: ${submissionsError.message}`);
  }

  const { data: finals = [], error: finalsError } = await s
    .from('final_assignments')
    .select('*')
    .eq('block_id', blockId);

  if (finalsError) {
    throw new Error(`Could not load final assignments for history: ${finalsError.message}`);
  }

  const finalsByStudent = new Map<string, any[]>();
  for (const finalAssignment of finals as any[]) {
    const list = finalsByStudent.get(finalAssignment.student_id) ?? [];
    list.push(finalAssignment);
    finalsByStudent.set(finalAssignment.student_id, list);
  }

  const outcomeRows = (submissions as any[]).map((submission) => {
    const assigned = finalsByStudent.get(submission.student_id) ?? [];
    const clubsReceived = assigned.length;
    const requested = Number(submission.max_clubs ?? 0);
    const unmetDemand = Math.max(0, requested - clubsReceived);
    const gotTopChoice = Boolean(
      submission.top_choice_club_id &&
        assigned.some(
          (assignment) => assignment.club_offering_id === submission.top_choice_club_id
        )
    );

    return {
      history_snapshot_id: snapshotId,
      student_id: submission.student_id,
      clubs_received: clubsReceived,
      got_top_choice: gotTopChoice,
      unmet_demand: unmetDemand,
      zero_club_flag: requested > 0 && clubsReceived === 0,
    };
  });

  if (outcomeRows.length > 0) {
    const { error: outcomesError } = await s
      .from('history_student_outcomes')
      .insert(outcomeRows);

    if (outcomesError) {
      throw new Error(`Could not create history outcomes: ${outcomesError.message}`);
    }
  }
}

async function deleteInChunks({
  s,
  table,
  column,
  values,
  message,
  chunkSize = 200,
}: {
  s: SupabaseClient;
  table: string;
  column: string;
  values: string[];
  message: string;
  chunkSize?: number;
}) {
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);

    if (chunk.length === 0) continue;

    await mustSucceed(
      s.from(table).delete().in(column, chunk),
      `${message} chunk ${Math.floor(i / chunkSize) + 1}`
    );
  }
}

async function mustSucceed(resultPromise: PromiseLike<any>, message: string) {
  const result = await resultPromise;

  if (result.error) {
    const details = [
      result.error.message,
      result.error.details,
      result.error.hint,
      result.error.code,
    ]
      .filter(Boolean)
      .join(' | ');

    throw new Error(`${message}: ${details || 'Unknown error'}`);
  }

  return result;
}
main().catch((error) => {
  console.error('\nSeed simulation failed.');
  console.error(error);
  process.exit(1);
});
