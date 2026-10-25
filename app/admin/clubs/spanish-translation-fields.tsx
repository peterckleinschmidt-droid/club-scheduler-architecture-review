'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { suggestSpanishTranslation } from './translation-actions';

type Props = {
  spanishTitle: string; spanishSection: string; spanishDescription: string; ready: boolean;
};
export default function SpanishTranslationFields(props: Props) {
  const [title, setTitle] = useState(props.spanishTitle);
  const [section, setSection] = useState(props.spanishSection);
  const [description, setDescription] = useState(props.spanishDescription);
  const [ready, setReady] = useState(props.ready);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  function suggest() {
    if ((title || section || description) && !window.confirm('Replace the Spanish text in these boxes with a new suggestion?')) return;
    const form = document.querySelector('form[data-club-editor="true"]') as HTMLFormElement | null;
    const value = (name: string) => String((form?.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '');
    setMessage(null); setError(false);
    startTransition(async () => {
      const result = await suggestSpanishTranslation({ clubTitle: value('club_title'), sectionLabel: value('section_label'), description: value('description') });
      setMessage(result.message); setError(!result.ok);
      if (result.translation) {
        setTitle(result.translation.clubTitle); setSection(result.translation.sectionLabel);
        setDescription(result.translation.description); setReady(false);
      }
    });
  }
  return <details className="rounded-xl border border-blue-200 bg-blue-50/60" open={Boolean(title || description)}>
    <summary className="cursor-pointer px-4 py-3 font-semibold text-blue-950">Spanish translation</summary>
    <div className="space-y-4 border-t border-blue-200 p-4">
      <p className="text-sm text-blue-950">Add or review the Spanish students will see beneath the English text.</p>
      <div><label className="mb-1 block text-sm font-medium">Club name in Spanish</label><Input name="club_title_es" value={title} onChange={(event) => { setTitle(event.target.value); setReady(false); }} placeholder="Optional for now" /></div>
      <div><label className="mb-1 block text-sm font-medium">Section in Spanish</label><Input name="section_label_es" value={section} onChange={(event) => { setSection(event.target.value); setReady(false); }} placeholder="Usually not needed" /></div>
      <div><label className="mb-1 block text-sm font-medium">Description in Spanish</label><Textarea name="description_es" value={description} onChange={(event) => { setDescription(event.target.value); setReady(false); }} placeholder="Optional for now" /></div>
      <div className="flex flex-wrap items-center gap-3"><Button type="button" variant="outline" onClick={suggest} disabled={pending}>{pending ? 'Writing suggestion...' : 'Suggest Spanish'}</Button><span className="text-xs text-slate-600">Automatic suggestions should be reviewed.</span></div>
      {message ? <div className={'rounded-lg border p-3 text-sm ' + (error ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950')}>{message}</div> : null}
      <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-white p-3 text-sm text-slate-800"><input type="checkbox" name="spanish_translation_ready" checked={ready} onChange={(event) => setReady(event.target.checked)} className="mt-1" /><span><strong>Ready for the student form</strong><br />Check this after the Spanish text has been reviewed.</span></label>
    </div>
  </details>;
}
