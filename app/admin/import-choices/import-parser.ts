import type { ParsedChoiceRow } from './types';

export const REQUIRED_COLUMNS = ['Grade'];

export const OPTIONAL_SETUP_COLUMNS = [
  'Timestamp',
  'Email Address',
  'Student Name',
  'Student Code',
  'Grade',
  'Homeroom',
  'Homeroom Code',
  'Max Clubs',
  'Top Choice',
  'Max Clubs Grade 3',
  'Top Choice Grade 3',
  'Max Clubs Grade 4',
  'Top Choice Grade 4',
  'Max Clubs Grade 5',
  'Top Choice Grade 5',
];

const REQUIRED_COLUMN_KEYS = REQUIRED_COLUMNS.map(normalizeHeader);
const OPTIONAL_SETUP_COLUMN_KEYS = OPTIONAL_SETUP_COLUMNS.map(normalizeHeader);

export function normalizeText(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeHeader(value: string | null | undefined) {
  return normalizeText(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

export function normalizeEmail(value: string | null | undefined) {
  return normalizeText(value);
}

export function normalizeStudentCode(value: string | null | undefined) {
  return String(value ?? '').trim();
}

function isNonClubColumn(header: string) {
  const normalized = normalizeHeader(header);

  return (
    REQUIRED_COLUMN_KEYS.includes(normalized) ||
    OPTIONAL_SETUP_COLUMN_KEYS.includes(normalized)
  );
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  const normalized = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }

      row.push(current);
      current = '';

      if (row.some((cell) => cell.trim() !== '')) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);

  if (row.some((cell) => cell.trim() !== '')) {
    rows.push(row);
  }

  return rows;
}

export function parseStudentChoiceCsv(text: string) {
  const rows = parseCsv(text);

  if (rows.length === 0) {
    return {
      headerErrors: ['The CSV file is empty.'],
      detectedClubColumns: [] as string[],
      rows: [] as ParsedChoiceRow[],
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const normalizedHeaders = headers.map(normalizeHeader);

  const headerErrors = REQUIRED_COLUMNS.filter(
    (column) => !normalizedHeaders.includes(normalizeHeader(column))
  ).map((column) => `Missing required column: ${column}`);

  const hasStudentCode = normalizedHeaders.includes(normalizeHeader('Student Code'));

  const hasIdentifiableStudentColumns =
    normalizedHeaders.includes(normalizeHeader('Email Address')) ||
    normalizedHeaders.includes(normalizeHeader('Student Name'));

  if (!hasStudentCode && !hasIdentifiableStudentColumns) {
    headerErrors.push(
      'Missing student identifier. Include Student Code for coded import, or Student Name / Email Address for identifiable import.'
    );
  }

  const columnIndex = new Map<string, number>();

  normalizedHeaders.forEach((header, index) => {
    if (!columnIndex.has(header)) {
      columnIndex.set(header, index);
    }
  });

  const detectedClubColumns = headers.filter((header) => {
    return header.trim() && !isNonClubColumn(header);
  });

  const parsedRows: ParsedChoiceRow[] = rows.slice(1).map((values, index) => {
    const raw: Record<string, string> = {};

    headers.forEach((header, headerIndex) => {
      raw[header] = (values[headerIndex] ?? '').trim();
    });

    const get = (column: string) => {
      const idx = columnIndex.get(normalizeHeader(column));
      return idx === undefined ? '' : (values[idx] ?? '').trim();
    };

    const ratings: Record<string, string> = {};

    detectedClubColumns.forEach((column) => {
      ratings[column] = raw[column] ?? '';
    });

    return {
      rowNumber: index + 2,
      timestamp: get('Timestamp'),
      studentCode: get('Student Code'),
      email: get('Email Address'),
      studentName: get('Student Name'),
      grade: get('Grade'),
      homeroom: get('Homeroom'),
      homeroomCode: get('Homeroom Code'),
      maxClubs: get('Max Clubs'),
      topChoice: get('Top Choice'),
      ratings,
      raw,
    };
  });

  return {
    headerErrors,
    detectedClubColumns,
    rows: parsedRows,
  };
}

export function ratingToScore(value: string) {
  const normalized = normalizeText(value);

  if (
    !normalized ||
    normalized === 'not interested' ||
    normalized === 'no' ||
    normalized === 'no thanks' ||
    normalized === 'no thank you' ||
    normalized === '0'
  ) {
    return {
      interestLevel: 'not_interested',
      interestScore: 0,
    };
  }

  if (
    normalized === 'would try this' ||
    normalized === 'would try' ||
    normalized === 'try' ||
    normalized === 'maybe' ||
    normalized === '1'
  ) {
    return {
      interestLevel: 'would_try',
      interestScore: 1,
    };
  }

  if (
    normalized === 'really want this' ||
    normalized === 'really want' ||
    normalized === 'top interest' ||
    normalized === 'definitely' ||
    normalized === 'yes' ||
    normalized === '2' ||
    normalized === '3'
  ) {
    return {
      interestLevel: 'really_want',
      interestScore: normalized === '3' ? 3 : 2,
    };
  }

  return null;
}

export function parseGrade(value: string) {
  const parsed = Number.parseInt(value, 10);

  if ([3, 4, 5].includes(parsed)) {
    return parsed;
  }

  return null;
}

export function parseMaxClubs(value: string) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed)) {
    return 1;
  }

  return Math.max(0, Math.min(3, parsed));
}

export function parseSubmittedAt(value: string) {
  if (!value.trim()) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

export function submissionSortValue(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  return parsed.getTime();
}