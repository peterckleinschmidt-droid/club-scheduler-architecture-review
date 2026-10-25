import { requireRole, getActiveContext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { saveOffering } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

function formatMeetingDays(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'No meeting day set';
  }

  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return 'No meeting day set';
}

export default async function Offerings() {
  const user = await requireRole(['teacher', 'admin']);
  const { block } = await getActiveContext();
  const supabase = await createClient();

  if (!block) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-slate-700">
        No active session.
      </div>
    );
  }

  const { data } = await supabase
    .from('club_offerings')
    .select('*')
    .eq('block_id', block.id)
    .eq('submitted_by_user_id', user.id)
    .order('created_at');

  const offeringRows = (data ?? []) as any[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">My Club Offerings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit and review the club offerings you have entered for the current
          session.
        </p>
      </div>

      {!block.teacher_offerings_open ? (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
          The offering window is closed. Contact the coordinator for changes.
        </div>
      ) : null}

      <form
        action={saveOffering}
        className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-2"
      >
        <input type="hidden" name="block_id" value={block.id} />

        <Input name="club_title" placeholder="Club Title" required />

        <Input
          name="section_label"
          placeholder="Section Label (optional)"
        />

        <Textarea
          name="description"
          placeholder="Description"
          className="md:col-span-2"
        />

        <Input
          name="sponsor_name"
          placeholder="Sponsor / Host / Leader (free text)"
          required
        />

        <Input
          name="meeting_days"
          placeholder="Meeting day(s), comma separated"
          required
        />

        <select name="capacity_type" className="rounded-xl border p-2">
          <option value="limited">Limited</option>
          <option value="unlimited">Unlimited</option>
        </select>

        <Input
          name="max_capacity"
          type="number"
          placeholder="Maximum capacity"
        />

        <Input
          name="minimum_viable_enrollment"
          type="number"
          placeholder="Minimum viable enrollment"
        />

        <select name="minimum_applies_to" className="rounded-xl border p-2">
          <option value="section">Section</option>
          <option value="title">Title</option>
        </select>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="grade_limited" />
          Grade-limited?
        </label>

        <Input
          name="eligible_grade"
          type="number"
          min="3"
          max="5"
          placeholder="Eligible grade"
        />

        <select name="matching_preference" className="rounded-xl border p-2">
          <option value="highest_interest">Highest interest</option>
          <option value="grade_balance">Grade balance</option>
        </select>

        <Textarea name="admin_notes" placeholder="Admin notes" />

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked />
          Active
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="show_to_students" defaultChecked />
          Show to students
        </label>

        <div className="md:col-span-2">
          <Button type="submit" disabled={!block.teacher_offerings_open}>
            Save offering
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">My submitted offerings</h2>

        {offeringRows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-slate-600">
            You have not submitted any club offerings for this session yet.
          </div>
        ) : (
          <div className="grid gap-3">
            {offeringRows.map((club) => (
              <div key={club.id} className="rounded-2xl border bg-white p-4">
                <div className="font-semibold text-slate-900">
                  {[club.club_title, club.section_label]
                    .filter(Boolean)
                    .join(' — ') || 'Untitled club'}
                </div>

                <p className="mt-1 text-sm text-slate-600">
                  Sponsor: {club.sponsor_name ?? '—'}
                </p>

                <p className="mt-1 text-sm text-slate-600">
                  {formatMeetingDays(club.meeting_days)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}