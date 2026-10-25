'use client';

import { useMemo, useState, useTransition } from 'react';
import { commitImportChoices, previewImportChoices } from './actions';
import type { ImportCommitResult, ImportPreview } from './types';

type Status = 'idle' | 'previewed' | 'imported' | 'error';

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </div>
  );
}

function IssueList({ issues }: { issues: ImportPreview['issues'] }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        No issues found.
      </div>
    );
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return (
    <div className="space-y-3">
      {errors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="font-semibold text-red-900">Rows that need attention</h3>
          <ul className="mt-2 space-y-1 text-sm text-red-900">
            {errors.map((issue, index) => (
              <li key={`error-${index}`}>
                {issue.rowNumber ? `Row ${issue.rowNumber}: ` : ''}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-semibold text-amber-900">Warnings</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {warnings.map((issue, index) => (
              <li key={`warning-${index}`}>
                {issue.rowNumber ? `Row ${issue.rowNumber}: ` : ''}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const rows = preview.validRows.slice(0, 25);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="border-b bg-slate-50 px-4 py-3">
        <h3 className="font-semibold text-slate-900">Preview</h3>
        <p className="mt-1 text-sm text-slate-600">
          Showing up to 25 ready-to-import responses.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-700">
            <tr>
              <th className="px-4 py-2 font-medium">Row</th>
              <th className="px-4 py-2 font-medium">Student</th>
              <th className="px-4 py-2 font-medium">Student status</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Homeroom</th>
              <th className="px-4 py-2 font-medium">Max clubs</th>
              <th className="px-4 py-2 font-medium">Top choice</th>
              <th className="px-4 py-2 font-medium">Club ratings</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={`${row.studentKey}-${row.rowNumber}`}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{row.rowNumber}</td>
                <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
                  {row.studentName}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  {row.matchType === 'new' ? 'Will be added' : 'Already in roster'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{row.grade}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  {row.teacherName ?? row.homeroom ?? 'Not matched'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{row.maxClubs}</td>
                <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                  {row.topChoiceLabel || 'None'}
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {row.ratings.filter((rating) => rating.interestScore > 0).length} positive choices
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImportChoicesClient() {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const canPreview = csvText.trim().length > 0 && !isPending;
  const canImport = Boolean(preview?.ok) && !isPending;

  const activeSummary = useMemo(() => {
    const source = commitResult ?? preview;
    if (!source) return null;

    return `${source.yearLabel ?? 'Active year'} / ${source.blockLabel ?? 'Current session'}`;
  }, [commitResult, preview]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setPreview(null);
    setCommitResult(null);
    setStatus('idle');
    setMessage('');

    if (!file) {
      setCsvText('');
      setFileName('');
      return;
    }

    setFileName(file.name);
    setCsvText(await file.text());
  }

  function handlePreview() {
    if (!canPreview) return;

    setCommitResult(null);
    setStatus('idle');
    setMessage('');

    startTransition(async () => {
      try {
        const result = await previewImportChoices(csvText);
        setPreview(result);
        setStatus('previewed');
        setMessage(
          result.ok
            ? `${result.validRows.length} responses are ready to import.`
            : 'Review the issues below before importing.'
        );
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while previewing the file.'
        );
      }
    });
  }

  function handleImport() {
    if (!canImport) return;

    setStatus('idle');
    setMessage('');

    startTransition(async () => {
      try {
        const result = await commitImportChoices(csvText);
        setCommitResult(result);
        setPreview(result);
        setStatus('imported');
        setMessage(
          result.importedCount > 0
            ? `${result.importedCount} responses were imported. ${result.createdStudentCount} new students were added.`
            : 'No responses were imported.'
        );
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Something went wrong while importing the file.'
        );
      }
    });
  }

  const currentResult = commitResult ?? preview;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload responses</h2>
        <p className="mt-2 text-sm text-slate-600">
          Export the Google Sheet as a CSV file, then upload it here. New students will be added
          from the file when their email is not already in the roster.
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />

          {fileName ? <p className="text-sm text-slate-600">Selected file: {fileName}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={!canPreview}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPending && status !== 'imported' ? 'Checking...' : 'Review before importing'}
            </button>

            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isPending && status === 'previewed' ? 'Importing...' : 'Import choices'}
            </button>
          </div>
        </div>
      </section>

      {message ? (
        <div
          className={`rounded-lg border p-4 text-sm ${
            status === 'error'
              ? 'border-red-200 bg-red-50 text-red-900'
              : status === 'imported'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-slate-50 text-slate-900'
          }`}
        >
          {message}
        </div>
      ) : null}

      {currentResult ? (
        <>
          {activeSummary ? (
            <div className="text-sm font-medium text-slate-700">
              Importing into: {activeSummary}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Rows in file" value={currentResult.totalRows} />
            <StatCard label="Ready to import" value={currentResult.validRows.length} />
            <StatCard label="Already in roster" value={currentResult.matchedStudentCount} />
            <StatCard label="New students" value={currentResult.newStudentCount} />
            <StatCard label="Homerooms matched" value={currentResult.matchedHomeroomCount} />
            <StatCard label="Homerooms not matched" value={currentResult.unmatchedHomeroomCount} />
            <StatCard label="Club columns found" value={currentResult.detectedClubColumns.length} />
            <StatCard label="Imported" value={commitResult ? commitResult.importedCount : 'Not yet'} />
          </div>

          <IssueList issues={currentResult.issues} />
          <PreviewTable preview={currentResult} />
        </>
      ) : null}
    </div>
  );
}