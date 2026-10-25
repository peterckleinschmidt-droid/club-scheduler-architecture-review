import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';

export default async function PublicClubSubmittedPage({
  params,
  searchParams,
}: {
  params: Promise<{ blockId: string }>;
  searchParams: Promise<{
    token?: string;
    clubId?: string;
    editToken?: string;
  }>;
}) {
  const { blockId } = await params;
  const { token = '', clubId = '', editToken = '' } = await searchParams;

  const supabase = createAdminClient();

  const { data: block } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();

  const editUrl =
    `/club-offerings/block/${blockId}/submit` +
    `?token=${encodeURIComponent(token)}` +
    `&clubId=${encodeURIComponent(clubId)}` +
    `&editToken=${encodeURIComponent(editToken)}`;

  const newSubmissionUrl =
    `/club-offerings/block/${blockId}/submit` +
    `?token=${encodeURIComponent(token)}` +
    `&new=1`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Club submission successful</h1>

        <p className="mt-4 text-slate-700">
          Thank you for submitting your club offering.
        </p>

        <p className="mt-2 text-slate-700">
          The club coordinator may reach out if questions or additional details are needed.
        </p>

        <p className="mt-2 text-slate-700">
          The coordinator will send a roster once scheduling is complete.
        </p>

        {!block?.public_club_submission_open ? (
          <div className="mt-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
            Club submissions are currently closed, so this submission may no longer be editable.
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {clubId && editToken ? (
            <Link href={editUrl}>
              <Button variant="outline">Review or edit this submission</Button>
            </Link>
          ) : null}

          <Link href={newSubmissionUrl}>
            <Button>Make another submission</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}