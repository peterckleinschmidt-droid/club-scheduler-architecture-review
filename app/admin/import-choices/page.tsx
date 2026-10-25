import ImportChoicesClient from './import-choices-client';

export default function ImportChoicesPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Import student choices
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Use this page after students complete the Google Form. Download the linked response sheet
          as a CSV file, upload it here, review the results, then import the choices for matching.
        </p>
      </div>

      <section className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
        <h2 className="font-semibold">Expected CSV columns</h2>
        <p className="mt-2">
          The first columns should be Timestamp, Email Address, Student Name, Grade, Homeroom, Max
          Clubs, and Top Choice. After that, include one column for each club. Club column names
          should match the current club names in Scheduler.
        </p>
        <p className="mt-2">
          New students will be added when their email is not already in the roster. Homeroom will be
          linked when the CSV value exactly matches an active teacher name from the Teachers page.
        </p>
        <p className="mt-2">
          Use these choice labels in the club columns: Not interested, Would try this, Really want
          this.
        </p>
      </section>

      <ImportChoicesClient />
    </main>
  );
}