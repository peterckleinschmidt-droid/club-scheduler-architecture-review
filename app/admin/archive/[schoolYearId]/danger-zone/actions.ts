"use server";

import { requireRole, getActiveContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

function clean(value: FormDataEntryValue | null) {
  return String(value ?? '').trim();
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

function ids(rows: any[]) {
  return rows.map((row) => row.id).filter(Boolean).map(String);
}

function uniqueCleanValues(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? '').trim())
        .filter((value) => value.length > 0)
    )
  );
}

async function deleteByIn({
  supabase,
  table,
  column,
  values,
  label,
  chunkSize = 150,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  table: string;
  column: string;
  values: string[];
  label: string;
  chunkSize?: number;
}) {
  const cleanValues = uniqueCleanValues(values);

  if (cleanValues.length === 0) return;

  for (let index = 0; index < cleanValues.length; index += chunkSize) {
    const chunk = cleanValues.slice(index, index + chunkSize);
    const chunkNumber = Math.floor(index / chunkSize) + 1;

    await mustSucceed(
      supabase.from(table).delete().in(column, chunk),
      `Could not delete ${label} chunk ${chunkNumber}`
    );
  }
}

async function updateByIn({
  supabase,
  table,
  column,
  values,
  patch,
  label,
  chunkSize = 150,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  table: string;
  column: string;
  values: string[];
  patch: Record<string, unknown>;
  label: string;
  chunkSize?: number;
}) {
  const cleanValues = uniqueCleanValues(values);

  if (cleanValues.length === 0) return;

  for (let index = 0; index < cleanValues.length; index += chunkSize) {
    const chunk = cleanValues.slice(index, index + chunkSize);
    const chunkNumber = Math.floor(index / chunkSize) + 1;

    await mustSucceed(
      supabase.from(table).update(patch).in(column, chunk),
      `Could not update ${label} chunk ${chunkNumber}`
    );
  }
}

async function selectIdsByIn({
  supabase,
  table,
  column,
  values,
  label,
  chunkSize = 150,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  table: string;
  column: string;
  values: string[];
  label: string;
  chunkSize?: number;
}) {
  const cleanValues = uniqueCleanValues(values);

  if (cleanValues.length === 0) return [] as any[];

  const rows: any[] = [];

  for (let index = 0; index < cleanValues.length; index += chunkSize) {
    const chunk = cleanValues.slice(index, index + chunkSize);
    const chunkNumber = Math.floor(index / chunkSize) + 1;

    const result = await mustSucceed(
      supabase.from(table).select('id').in(column, chunk),
      `Could not load ${label} chunk ${chunkNumber}`
    );

    rows.push(...((result.data ?? []) as any[]));
  }

  return rows;
}

export async function hardDeleteSchoolYear(formData: FormData) {
  await requireRole(['admin']);

  const schoolYearId = clean(formData.get('school_year_id'));
  const typedLabel = clean(formData.get('school_year_label_confirmation'));
  const acknowledged = clean(formData.get('hard_delete_acknowledgement'));

  if (!schoolYearId) {
    throw new Error('Missing school year ID.');
  }

  if (acknowledged !== 'yes') {
    throw new Error(
      'You must acknowledge that this permanently deletes the school year.'
    );
  }

  const supabase = createAdminClient();
  const { year: activeYear } = await getActiveContext();

  const { data: schoolYear, error: schoolYearError } = await supabase
    .from('school_years')
    .select('*')
    .eq('id', schoolYearId)
    .maybeSingle();

  if (schoolYearError || !schoolYear) {
    throw new Error(
      `Could not load school year: ${schoolYearError?.message ?? 'Not found'}`
    );
  }

  if (activeYear?.id === schoolYear.id || schoolYear.is_active) {
    throw new Error('The current school year cannot be permanently deleted.');
  }

  const expectedLabel = String(schoolYear.label ?? '').trim();

  if (!expectedLabel) {
    throw new Error(
      'This school year does not have a label. Permanent delete is blocked.'
    );
  }

  if (typedLabel !== expectedLabel) {
    throw new Error('The typed school year label does not match exactly.');
  }

  const [
    { data: blocks = [], error: blocksError },
    { data: students = [], error: studentsError },
  ] = await Promise.all([
    supabase.from('blocks').select('id').eq('school_year_id', schoolYear.id),
    supabase.from('students').select('id').eq('school_year_id', schoolYear.id),
  ]);

  if (blocksError) {
    throw new Error(`Could not load blocks: ${blocksError.message}`);
  }

  if (studentsError) {
    throw new Error(`Could not load students: ${studentsError.message}`);
  }

  const blockIds = ids(blocks as any[]);
  const studentIds = ids(students as any[]);

  const [clubOfferings, blockStudentSubmissions, studentLinkedSubmissions, matchRuns] =
    await Promise.all([
      selectIdsByIn({
        supabase,
        table: 'club_offerings',
        column: 'block_id',
        values: blockIds,
        label: 'clubs by block',
      }),
      selectIdsByIn({
        supabase,
        table: 'student_submissions',
        column: 'block_id',
        values: blockIds,
        label: 'student choices by block',
      }),
      selectIdsByIn({
        supabase,
        table: 'student_submissions',
        column: 'student_id',
        values: studentIds,
        label: 'student choices by student',
      }),
      selectIdsByIn({
        supabase,
        table: 'match_runs',
        column: 'block_id',
        values: blockIds,
        label: 'matching runs by block',
      }),
    ]);

  const { data: historySnapshots = [], error: historySnapshotsError } =
    await supabase
      .from('history_snapshots')
      .select('id')
      .eq('school_year_id', schoolYear.id);

  if (historySnapshotsError) {
    throw new Error(
      `Could not load saved results: ${historySnapshotsError.message}`
    );
  }

  const clubOfferingIds = ids(clubOfferings as any[]);
  const submissionIds = uniqueCleanValues([
    ...ids(blockStudentSubmissions as any[]),
    ...ids(studentLinkedSubmissions as any[]),
  ]);
  const matchRunIds = ids(matchRuns as any[]);
  const historySnapshotIds = ids(historySnapshots as any[]);

  /**
   * Delete order matters.
   * Child rows are removed first, then parent rows.
   * Large ID lists are processed in chunks to avoid oversized Supabase requests.
   */

  await deleteByIn({
    supabase,
    table: 'history_student_outcomes',
    column: 'history_snapshot_id',
    values: historySnapshotIds,
    label: 'saved student results by saved block result',
  });

  await deleteByIn({
    supabase,
    table: 'history_student_outcomes',
    column: 'student_id',
    values: studentIds,
    label: 'saved student results by student',
  });

  await deleteByIn({
    supabase,
    table: 'history_snapshots',
    column: 'id',
    values: historySnapshotIds,
    label: 'saved block results',
  });

  await deleteByIn({
    supabase,
    table: 'assignment_overrides',
    column: 'block_id',
    values: blockIds,
    label: 'roster changes by block',
  });

  await deleteByIn({
    supabase,
    table: 'assignment_overrides',
    column: 'match_run_id',
    values: matchRunIds,
    label: 'roster changes by matching run',
  });

  await deleteByIn({
    supabase,
    table: 'assignment_overrides',
    column: 'student_id',
    values: studentIds,
    label: 'roster changes by student',
  });

  await deleteByIn({
    supabase,
    table: 'assignment_overrides',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'roster changes by club',
  });

  await deleteByIn({
    supabase,
    table: 'final_assignments',
    column: 'block_id',
    values: blockIds,
    label: 'final rosters by block',
  });

  await deleteByIn({
    supabase,
    table: 'final_assignments',
    column: 'student_id',
    values: studentIds,
    label: 'final rosters by student',
  });

  await deleteByIn({
    supabase,
    table: 'final_assignments',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'final rosters by club',
  });

  await deleteByIn({
    supabase,
    table: 'draft_assignments',
    column: 'match_run_id',
    values: matchRunIds,
    label: 'draft rosters by matching run',
  });

  await deleteByIn({
    supabase,
    table: 'draft_assignments',
    column: 'student_id',
    values: studentIds,
    label: 'draft rosters by student',
  });

  await deleteByIn({
    supabase,
    table: 'draft_assignments',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'draft rosters by club',
  });

  await deleteByIn({
    supabase,
    table: 'match_demand_summaries',
    column: 'match_run_id',
    values: matchRunIds,
    label: 'club interest summaries by matching run',
  });

  await deleteByIn({
    supabase,
    table: 'match_demand_summaries',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'club interest summaries by club',
  });

  await deleteByIn({
    supabase,
    table: 'match_runs',
    column: 'id',
    values: matchRunIds,
    label: 'matching runs',
  });

  await deleteByIn({
    supabase,
    table: 'below_minimum_decisions',
    column: 'block_id',
    values: blockIds,
    label: 'small-club decisions by block',
  });

  await deleteByIn({
    supabase,
    table: 'below_minimum_decisions',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'small-club decisions by club',
  });

  await deleteByIn({
    supabase,
    table: 'student_interest_ratings',
    column: 'student_submission_id',
    values: submissionIds,
    label: 'student club ratings by student choice form',
  });

  await deleteByIn({
    supabase,
    table: 'student_interest_ratings',
    column: 'club_offering_id',
    values: clubOfferingIds,
    label: 'student club ratings by club',
  });

  await deleteByIn({
    supabase,
    table: 'student_submissions',
    column: 'id',
    values: submissionIds,
    label: 'student choice forms',
  });

  /**
   * Safety cleanup for older/cross-linked test data.
   * A student_submissions row can reference a club through top_choice_club_id.
   * If any such row was outside the selected block/student list, it can still
   * block club deletion. Null the top-choice reference before deleting clubs.
   */
  await updateByIn({
    supabase,
    table: 'student_submissions',
    column: 'top_choice_club_id',
    values: clubOfferingIds,
    patch: { top_choice_club_id: null },
    label: 'student choice top club references',
  });

  await deleteByIn({
    supabase,
    table: 'club_offerings',
    column: 'id',
    values: clubOfferingIds,
    label: 'clubs',
  });

  await deleteByIn({
    supabase,
    table: 'students',
    column: 'id',
    values: studentIds,
    label: 'students',
  });

  await deleteByIn({
    supabase,
    table: 'blocks',
    column: 'id',
    values: blockIds,
    label: 'club blocks',
  });

  await mustSucceed(
    supabase.from('school_years').delete().eq('id', schoolYear.id),
    'Could not delete school year'
  );

  revalidatePath('/admin/archive');
  revalidatePath('/admin');
  revalidatePath('/admin/reset');

  redirect('/admin/archive');
}
