import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';

export default async function StudentSubmittedPage({
  params,
}: {
  params: Promise<{ blockId: string }>;
}) {
  const { blockId } = await params;
  const supabase = await createClient();

  const { data: block } = await supabase
    .from('blocks')
    .select('*')
    .eq('id', blockId)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Your response was submitted</h1>

        <p className="mt-4 text-slate-700">
          Thanks for submitting your club choices.
        </p>

        <p className="mt-2 text-slate-700">
          You’ll hear back about your club assignments after scheduling is complete.
        </p>

        <p className="mt-2 text-slate-700">
          If the form is still open and you need to make changes, you can return to
          the form and submit again.
        </p>

        <div className="mt-6">
          <Link href={`/student/block/${blockId}`}>
            <Button variant="outline">
              {block?.student_form_open ? 'Return to form' : 'View form'}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}