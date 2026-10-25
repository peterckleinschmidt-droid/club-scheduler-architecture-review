
export const TEST_FIXTURE_MARKER = 'TEST_FIXTURE_MEDIUM_V1';
export const TEST_STUDENT_CODE_PREFIX = 'STU-TEST-MED-';
export const TEST_HOMEROOM_CODE_PREFIX = 'TEST-HR-';

export type TestHomeroom = {
  homeroom_code: string;
  homeroom_name: string;
  notes: string;
  active: string;
};

export type TestClub = {
  club_title: string;
  section_label: string | null;
  description: string;
  sponsor_name: string;
  leader_email: string;
  meeting_days: string[];
  capacity_type: 'limited' | 'unlimited';
  max_capacity: number | null;
  minimum_viable_enrollment: number | null;
  minimum_applies_to: 'section' | 'title';
  grade_limited: boolean;
  eligible_grades: number[] | null;
  matching_preference: 'highest_interest' | 'grade_balance';
};

export type TestStudent = {
  student_code: string;
  student_name: string;
  student_email: string;
  grade: number;
  homeroom_code: string;
  homeroom_name: string;
  active: string;
  first_seen_block: string;
  last_seen_block: string;
};

export type TestChoice = {
  student_code: string;
  grade: number;
  homeroom_code: string;
  max_clubs: number;
  top_choice: string;
  choices: Record<string, string>;
};

export const testHomerooms: TestHomeroom[] = [
  { homeroom_code: 'TEST-HR-301', homeroom_name: 'Adams', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
  { homeroom_code: 'TEST-HR-302', homeroom_name: 'Baker', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
  { homeroom_code: 'TEST-HR-401', homeroom_name: 'Chen', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
  { homeroom_code: 'TEST-HR-402', homeroom_name: 'Davis', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
  { homeroom_code: 'TEST-HR-501', homeroom_name: 'Evans', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
  { homeroom_code: 'TEST-HR-502', homeroom_name: 'Foster', notes: TEST_FIXTURE_MARKER, active: 'TRUE' },
];

export const testClubs: TestClub[] = [
  {
    club_title: 'Robotics Lab',
    section_label: null,
    description: 'Build and test small robots. This club is intentionally popular and capacity-limited.',
    sponsor_name: 'R. Patel',
    leader_email: 'robotics@example.org',
    meeting_days: ['Monday'],
    capacity_type: 'limited',
    max_capacity: 8,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Art Studio',
    section_label: null,
    description: 'Drawing, painting, and creative projects.',
    sponsor_name: 'A. Nguyen',
    leader_email: 'art@example.org',
    meeting_days: ['Tuesday'],
    capacity_type: 'limited',
    max_capacity: 10,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'grade_balance',
  },
  {
    club_title: 'Board Games',
    section_label: null,
    description: 'Strategy games, card games, and cooperative games.',
    sponsor_name: 'M. Greene',
    leader_email: 'games@example.org',
    meeting_days: ['Wednesday'],
    capacity_type: 'limited',
    max_capacity: 12,
    minimum_viable_enrollment: 5,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Podcast Club',
    section_label: null,
    description: 'Plan, record, and edit short student podcasts.',
    sponsor_name: 'S. Lopez',
    leader_email: 'podcast@example.org',
    meeting_days: ['Thursday'],
    capacity_type: 'limited',
    max_capacity: 8,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Outdoor Explorers',
    section_label: null,
    description: 'Short outdoor activities and nature observation.',
    sponsor_name: 'T. Brown',
    leader_email: 'outdoors@example.org',
    meeting_days: ['Friday'],
    capacity_type: 'unlimited',
    max_capacity: null,
    minimum_viable_enrollment: 3,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'grade_balance',
  },
  {
    club_title: 'Chess Club',
    section_label: null,
    description: 'Learn and play chess. This club is intentionally designed to be below minimum.',
    sponsor_name: 'C. Miller',
    leader_email: 'chess@example.org',
    meeting_days: ['Monday'],
    capacity_type: 'limited',
    max_capacity: 10,
    minimum_viable_enrollment: 6,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Cooking Basics',
    section_label: null,
    description: 'Simple cooking and food prep skills. Small capacity creates demand pressure.',
    sponsor_name: 'D. Smith',
    leader_email: 'cooking@example.org',
    meeting_days: ['Tuesday'],
    capacity_type: 'limited',
    max_capacity: 6,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: '5th Grade Leadership',
    section_label: null,
    description: 'Leadership and school service projects for fifth grade students.',
    sponsor_name: 'K. Wilson',
    leader_email: 'leadership@example.org',
    meeting_days: ['Wednesday'],
    capacity_type: 'limited',
    max_capacity: 10,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: true,
    eligible_grades: [5],
    matching_preference: 'highest_interest',
  },
  {
    club_title: '3rd Grade Drawing',
    section_label: null,
    description: 'Drawing club for third graders.',
    sponsor_name: 'L. Hall',
    leader_email: 'drawing@example.org',
    meeting_days: ['Thursday'],
    capacity_type: 'limited',
    max_capacity: 8,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: true,
    eligible_grades: [3],
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Drama Workshop',
    section_label: null,
    description: 'Acting games and short scenes. This club is designed to be borderline below minimum.',
    sponsor_name: 'P. Carter',
    leader_email: 'drama@example.org',
    meeting_days: ['Friday'],
    capacity_type: 'limited',
    max_capacity: 12,
    minimum_viable_enrollment: 8,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'grade_balance',
  },
  {
    club_title: 'Math Puzzles',
    section_label: null,
    description: 'Logic puzzles, patterns, and math games.',
    sponsor_name: 'J. Kim',
    leader_email: 'math@example.org',
    meeting_days: ['Monday'],
    capacity_type: 'limited',
    max_capacity: 10,
    minimum_viable_enrollment: 4,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
  {
    club_title: 'Library Helpers',
    section_label: null,
    description: 'Help organize library materials and recommend books.',
    sponsor_name: 'N. White',
    leader_email: 'library@example.org',
    meeting_days: ['Thursday'],
    capacity_type: 'limited',
    max_capacity: 8,
    minimum_viable_enrollment: 3,
    minimum_applies_to: 'section',
    grade_limited: false,
    eligible_grades: null,
    matching_preference: 'highest_interest',
  },
];

const firstNames = [
  'Avery', 'Blake', 'Casey', 'Dakota', 'Emerson', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jordan',
  'Kai', 'Logan', 'Morgan', 'Nova', 'Oakley', 'Parker', 'Quinn', 'Riley', 'Sawyer', 'Taylor',
  'Uma', 'Val', 'Winter', 'Alex', 'Bailey', 'Cameron', 'Devon', 'Elliot', 'Frankie', 'Gale',
  'Hayden', 'Isa', 'Jules', 'Kendall', 'Lane', 'Micah', 'Nico', 'Onyx', 'Peyton', 'River',
  'Skyler', 'Tatum', 'Vega', 'Wren', 'Yael', 'Zion', 'Arden', 'Briar', 'Corey', 'Drew',
  'Ellis', 'Flynn', 'Greer', 'Hollis', 'Ira', 'Jamie', 'Kit', 'Lennox', 'Marlow', 'Noel',
];

const lastNames = [
  'Anderson', 'Brooks', 'Clark', 'Diaz', 'Edwards', 'Fisher', 'Garcia', 'Harris', 'Ivanov', 'Johnson',
  'Khan', 'Lee', 'Martinez', 'Nguyen', 'Owens', 'Patel', 'Quincy', 'Reed', 'Singh', 'Turner',
  'Ulrich', 'Vaughn', 'Walker', 'Xu', 'Young', 'Zimmer', 'Bennett', 'Coleman', 'Duncan', 'Evans',
  'Flores', 'Grant', 'Hayes', 'Irwin', 'Jacobs', 'Kim', 'Lopez', 'Morris', 'Nelson', 'Ortiz',
  'Price', 'Ramirez', 'Scott', 'Thomas', 'Underwood', 'Valdez', 'Williams', 'Yu', 'Zhang', 'Bell',
  'Cooper', 'Day', 'Ellison', 'Fox', 'Green', 'Hill', 'James', 'Knight', 'Lewis', 'Moore',
];

export const testStudents: TestStudent[] = Array.from({ length: 60 }).map((_, index) => {
  const number = index + 1;
  const grade = index < 20 ? 3 : index < 40 ? 4 : 5;
  const homeroom = testHomerooms[index % testHomerooms.length];
  const padded = String(number).padStart(3, '0');

  return {
    student_code: `STU-TEST-MED-${padded}`,
    student_name: `${firstNames[index]} ${lastNames[index]}`,
    student_email: `stu.test.med.${padded}@example.org`,
    grade,
    homeroom_code: homeroom.homeroom_code,
    homeroom_name: homeroom.homeroom_name,
    active: 'TRUE',
    first_seen_block: 'Medium Test Fixture',
    last_seen_block: 'Medium Test Fixture',
  };
});

const clubTitles = testClubs.map((club) => club.club_title);

const codedChoiceClubTitles = [...testClubs]
  .sort((a, b) => {
    const titleCompare = a.club_title.localeCompare(b.club_title);
    if (titleCompare !== 0) return titleCompare;

    return String(a.section_label ?? '').localeCompare(String(b.section_label ?? ''));
  })
  .map((club) => club.club_title);

function interestFor(studentIndex: number, clubTitle: string, grade: number) {
  const popular = ['Robotics Lab', 'Cooking Basics', 'Art Studio'];
  const steady = ['Board Games', 'Podcast Club', 'Outdoor Explorers', 'Math Puzzles'];

  if (clubTitle === '5th Grade Leadership' && grade !== 5) return 'No thanks';
  if (clubTitle === '3rd Grade Drawing' && grade !== 3) return 'No thanks';

  if (studentIndex >= 54 && ['Chess Club', 'Drama Workshop'].includes(clubTitle)) return 'Definitely';
  if (studentIndex >= 54) return 'No thanks';

  if (popular.includes(clubTitle)) {
    if (studentIndex % 3 === 0 || studentIndex % 5 === 0) return 'Definitely';
    if (studentIndex % 4 === 0) return 'Maybe';
    return 'No thanks';
  }

  if (steady.includes(clubTitle)) {
    if (studentIndex % 4 === 1 || studentIndex % 6 === 2) return 'Definitely';
    if (studentIndex % 3 === 1) return 'Maybe';
    return 'No thanks';
  }

  if (clubTitle === 'Chess Club') {
    return [7, 18, 41].includes(studentIndex) ? 'Definitely' : 'No thanks';
  }

  if (clubTitle === 'Drama Workshop') {
    return [4, 14, 24, 34, 44, 52].includes(studentIndex) ? 'Definitely' : 'No thanks';
  }

  if (clubTitle === '5th Grade Leadership') {
    return studentIndex % 4 === 0 ? 'Definitely' : studentIndex % 5 === 0 ? 'Maybe' : 'No thanks';
  }

  if (clubTitle === '3rd Grade Drawing') {
    return studentIndex % 4 === 2 ? 'Definitely' : studentIndex % 5 === 2 ? 'Maybe' : 'No thanks';
  }

  if (clubTitle === 'Library Helpers') {
    return studentIndex % 7 === 0 ? 'Definitely' : studentIndex % 5 === 1 ? 'Maybe' : 'No thanks';
  }

  return 'No thanks';
}

function topChoiceFor(choices: Record<string, string>) {
  const definitely = clubTitles.find((clubTitle) => choices[clubTitle] === 'Definitely');
  if (definitely) return definitely;

  const maybe = clubTitles.find((clubTitle) => choices[clubTitle] === 'Maybe');
  return maybe ?? '';
}

function ensureAtLeastOnePositiveChoice(choices: Record<string, string>, grade: number) {
  const topChoice = topChoiceFor(choices);

  if (topChoice) {
    return topChoice;
  }

  // Fallback that is available to all grades and has unlimited capacity.
  choices['Outdoor Explorers'] = 'Maybe';
  return 'Outdoor Explorers';
}

export const testChoices: TestChoice[] = testStudents.map((student, index) => {
  const choices: Record<string, string> = {};

  for (const clubTitle of clubTitles) {
    choices[clubTitle] = interestFor(index, clubTitle, student.grade);
  }

  const topChoice = ensureAtLeastOnePositiveChoice(choices, student.grade);

  return {
    student_code: student.student_code,
    grade: student.grade,
    homeroom_code: student.homeroom_code,
    max_clubs: index % 6 === 0 ? 3 : index % 2 === 0 ? 2 : 1,
    top_choice: topChoice,
    choices,
  };
});

export function homeroomSheetValues() {
  return [
    ['homeroom_code', 'homeroom_name', 'notes', 'active'],
    ...testHomerooms.map((homeroom) => [
      homeroom.homeroom_code,
      homeroom.homeroom_name,
      homeroom.notes,
      homeroom.active,
    ]),
  ];
}

export function studentMapSheetValues() {
  return [
    [
      'student_code',
      'student_name',
      'student_email',
      'grade',
      'homeroom_code',
      'homeroom_name',
      'active',
      'first_seen_block',
      'last_seen_block',
    ],
    ...testStudents.map((student) => [
      student.student_code,
      student.student_name,
      student.student_email,
      String(student.grade),
      student.homeroom_code,
      student.homeroom_name,
      student.active,
      student.first_seen_block,
      student.last_seen_block,
    ]),
  ];
}

export function codedChoicesSheetValues() {
  return [
    ['student_code', 'grade', 'homeroom_code', 'max_clubs', 'top_choice', ...codedChoiceClubTitles],
    ...testChoices.map((choice) => [
      choice.student_code,
      String(choice.grade),
      choice.homeroom_code,
      String(choice.max_clubs),
      choice.top_choice,
      ...codedChoiceClubTitles.map((clubTitle) => choice.choices[clubTitle] ?? 'No thanks'),
    ]),
  ];
}
