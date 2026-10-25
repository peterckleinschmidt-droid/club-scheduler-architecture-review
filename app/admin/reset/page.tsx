import { yearEndReset } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export default function Reset() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div><h1 className="text-2xl font-bold">Start a New School Year</h1><p className="mt-1 max-w-3xl text-sm text-slate-600">Save the current school year for reference and set up a fresh year for the next round of clubs.</p></div>
      <form action={yearEndReset} className="space-y-5 rounded-2xl border border-orange-200 bg-orange-50 p-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><div className="font-semibold">Past years stay available</div><p className="mt-1">Starting a new school year keeps prior years available in Past Years. This page prepares the app for a new year; it does not permanently delete saved years.</p></div>
        <div className="rounded-xl border border-orange-200 bg-white p-4 text-sm text-slate-700"><div className="font-semibold text-slate-900">What will happen</div><ul className="mt-2 list-disc space-y-1 pl-5"><li>The current school year will be saved for reference.</li><li>Any open club sign-up or student choice forms will be closed.</li><li>A new school year will be created.</li><li>No session is created automatically. After annual setup, you will choose the first session name.</li><li>Homerooms will stay available for review in the new year.</li><li>Student lists, club choices, rosters, and reports from prior years will stay in Past Years.</li><li>The new school year will start with a clean student list.</li></ul></div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-950"><div className="font-semibold">Before you continue</div><p className="mt-1">Only do this when you are ready to stop working in the current school year and begin setting up the next one.</p></div>
        <div><label className="mb-1 block text-sm font-medium text-orange-950">New school year</label><Input name="new_year_label" placeholder="Example: 2027-2028" required /><p className="mt-1 text-xs text-orange-900">This name will appear throughout the app for the new school year.</p></div>
        <div><label className="mb-1 block text-sm font-medium text-orange-950">Confirmation phrase</label><Input name="confirm" placeholder="Type START NEW SCHOOL YEAR" required /><p className="mt-1 text-xs text-orange-900">Type exactly: <span className="font-semibold">START NEW SCHOOL YEAR</span></p></div>
        <div className="flex flex-col gap-3 border-t border-orange-200 pt-4 sm:flex-row sm:items-center"><Button type="submit" variant="destructive">Start new school year</Button><p className="text-xs text-orange-900">When this finishes, continue through Annual Setup, review homerooms, update Google, and then choose the first session name.</p></div>
      </form>
    </div>
  );
}
