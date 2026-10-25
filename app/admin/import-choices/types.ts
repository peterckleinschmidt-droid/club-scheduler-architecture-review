export type ImportStudent = {
  id: string;
  student_email: string | null;
  student_name: string;
  grade: number | null;
  teacher_id: string | null;
  teacher_homeroom_text?: string | null;
  external_student_id?: string | null;
  is_active?: boolean | null;
};

export type ImportTeacher = {
  id: string;
  teacher_name: string;
  is_active?: boolean | null;
};

export type ImportClub = {
  id: string;
  club_title: string;
  section_label: string | null;
  is_active?: boolean | null;
  show_to_students?: boolean | null;
  grade_limited?: boolean | null;
  eligible_grade?: number | null;
  eligible_grades?: number[] | string[] | null;
};

export type ParsedChoiceRow = {
  rowNumber: number;
  timestamp: string;
  studentCode: string;
  email: string;
  studentName: string;
  grade: string;
  homeroom: string;
  homeroomCode: string;
  maxClubs: string;
  topChoice: string;
  ratings: Record<string, string>;
  raw: Record<string, string>;
};

export type ValidatedRating = {
  clubId: string;
  clubTitle: string;
  response: string;
  interestLevel: string;
  interestScore: number;
};

export type StudentMatchType = 'existing' | 'new';

export type ImportIdentityMode = 'coded' | 'identifiable';

export type ValidatedChoiceRow = {
  rowNumber: number;
  studentKey: string;
  studentId: string | null;
  matchType: StudentMatchType;
  identityMode: ImportIdentityMode;
  studentCode: string;
  studentName: string;
  email: string;
  grade: number;
  homeroom: string;
  homeroomCode: string;
  teacherId: string | null;
  teacherName: string | null;
  submittedAt: string;
  participationPreference: string;
  maxClubs: number;
  topChoiceClubId: string | null;
  topChoiceLabel: string;
  ratings: ValidatedRating[];
  warnings: string[];
};

export type ImportIssue = {
  rowNumber: number | null;
  severity: 'warning' | 'error';
  message: string;
};

export type ImportPreview = {
  ok: boolean;
  yearLabel: string | null;
  blockLabel: string | null;
  totalRows: number;
  validRows: ValidatedChoiceRow[];
  issues: ImportIssue[];
  matchedStudentCount: number;
  newStudentCount: number;
  matchedHomeroomCount: number;
  unmatchedHomeroomCount: number;
  duplicateStudentCount: number;
  replacedDuplicateRows: number;
  detectedClubColumns: string[];
};

export type ImportCommitResult = ImportPreview & {
  importedCount: number;
  createdStudentCount: number;
};