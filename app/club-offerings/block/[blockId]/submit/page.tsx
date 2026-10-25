import { createAdminClient } from '@/lib/supabase/admin';
import { submitPublicClubOffering } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClubFormValidator } from './club-form-validator';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const GRADES = [3, 4, 5];

export default async function PublicClubSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ blockId: string }>;
  searchParams: Promise<{
    token?: string;
    clubId?: string;
    editToken?: string;
    new?: string;
  }>;
}) {
  const { blockId } = await params;
  const {
    token = '',
    clubId = '',
    editToken = '',
    new: newSubmission = '',
  } = await searchParams;

  const supabase = createAdminClient();

  const { data: block } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();

  if (!block) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pt-8">
        <h1 className="text-3xl font-bold">Club session not found</h1>
        <p className="text-slate-600">
          Please check the link or contact the club coordinator.
        </p>
      </div>
    );
  }

  if (!block.public_club_submission_open) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pt-8">
        <h1 className="text-3xl font-bold">Club sign-up is closed</h1>
        <p className="text-slate-600">
          This form is not accepting club ideas right now. Please contact the club coordinator if you have questions.
        </p>
      </div>
    );
  }

  if (!token || token !== block.public_club_submission_token) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pt-8">
        <h1 className="text-3xl font-bold">This link is not working</h1>
        <p className="text-slate-600">
          The club sign-up link is missing or no longer valid. Please contact the club coordinator for a new link.
        </p>
      </div>
    );
  }

  let existingClub: any = null;

  if (clubId && editToken && newSubmission !== '1') {
    const { data } = await supabase
      .from('club_offerings')
      .select('*')
      .eq('id', clubId)
      .eq('block_id', blockId)
      .eq('public_edit_token', editToken)
      .maybeSingle();

    existingClub = data;
  }

  const meetingDays: string[] = Array.isArray(existingClub?.meeting_days)
    ? existingClub.meeting_days
    : [];

  const eligibleGrades: number[] = Array.isArray(existingClub?.eligible_grades)
    ? existingClub.eligible_grades
    : existingClub?.eligible_grade
      ? [existingClub.eligible_grade]
      : [];

  const isEditMode = Boolean(existingClub);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pt-6">
      <div>
        <h1 className="text-3xl font-bold">
          {isEditMode ? 'Update Your Club' : 'Offer a Club'}
        </h1>

        <p className="mt-2 text-slate-600">
          Tell us about the club you would like to lead. The coordinator will review club ideas before students choose clubs.
        </p>

        {isEditMode ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Your previous club information is shown below. Make any changes and submit again.
          </div>
        ) : null}
      </div>

      <form
        id="public-club-submission-form"
        action={submitPublicClubOffering.bind(null, blockId, token)}
        className="grid gap-4 rounded-2xl border bg-white p-6 md:grid-cols-2"
      >
        <ClubFormValidator formId="public-club-submission-form" />

        {isEditMode ? (
          <>
            <input type="hidden" name="club_id" value={existingClub.id} />
            <input
              type="hidden"
              name="edit_token"
              value={existingClub.public_edit_token}
            />
          </>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium">Club name</label>
          <Input
            name="club_title"
            placeholder="Example: Chess Club"
            defaultValue={existingClub?.club_title ?? ''}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Section</label>
          <Input
            name="section_label"
            placeholder='Optional, e.g. "Mondays" or "Grade 3"'
            defaultValue={existingClub?.section_label ?? ''}
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">What will students do?</label>
          <Textarea
            name="description"
            placeholder="Briefly describe the activities students will do in this club."
            defaultValue={existingClub?.description ?? ''}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Leader name</label>
          <Input
            name="sponsor_name"
            placeholder="Your name"
            defaultValue={existingClub?.sponsor_name ?? ''}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Leader email</label>
          <Input
            name="leader_email"
            type="email"
            placeholder="Optional, but helpful"
            defaultValue={existingClub?.leader_email ?? ''}
          />
        </div>

        <div className="md:col-span-2" data-validation="meeting-days">
          <label className="mb-2 block text-sm font-medium">
            Meeting day(s)
          </label>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {DAYS.map((day) => (
              <label
                key={day}
                className="flex items-center gap-2 rounded-xl border p-3"
              >
                <input
                  type="checkbox"
                  name="meeting_days"
                  value={day}
                  defaultChecked={meetingDays.includes(day)}
                />
                {day}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Spots</label>
          <select
            name="capacity_type"
            defaultValue={existingClub?.capacity_type ?? 'limited'}
            className="w-full rounded-xl border p-2"
          >
            <option value="limited">Limited number of students</option>
            <option value="unlimited">No set limit</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Maximum students</label>
          <Input
            name="max_capacity"
            type="number"
            placeholder="Required if spots are limited"
            defaultValue={existingClub?.max_capacity ?? ''}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Minimum students</label>
          <Input
            name="minimum_viable_enrollment"
            type="number"
            placeholder="Smallest number needed to run"
            defaultValue={existingClub?.minimum_viable_enrollment ?? ''}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Minimum applies to</label>
          <select
            name="minimum_applies_to"
            defaultValue={existingClub?.minimum_applies_to ?? 'section'}
            className="w-full rounded-xl border p-2"
          >
            <option value="section">This section only</option>
            <option value="title">All sections with this club name</option>
          </select>
        </div>

        <label className="flex items-center gap-2 rounded-xl border bg-slate-50 p-3 md:col-span-2">
          <input
            type="checkbox"
            name="grade_limited"
            defaultChecked={Boolean(existingClub?.grade_limited)}
          />
          Limit this club to specific grades
        </label>

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium">
            Grades that can choose this club
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            {GRADES.map((grade) => (
              <label
                key={grade}
                className="flex items-center gap-2 rounded-xl border p-3"
              >
                <input
                  type="checkbox"
                  name="eligible_grades"
                  value={grade}
                  defaultChecked={eligibleGrades.includes(grade)}
                />
                Grade {grade}
              </label>
            ))}
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">How should this club be filled?</label>
          <select
            name="matching_preference"
            defaultValue={existingClub?.matching_preference ?? 'highest_interest'}
            className="w-full rounded-xl border p-2"
          >
            <option value="highest_interest">Prioritize students who are most interested</option>
            <option value="grade_balance">Try for an even mix of grades when possible</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <Button type="submit">
            {isEditMode ? 'Submit updated club' : 'Submit club'}
          </Button>
        </div>
      </form>
    </div>
  );
}
