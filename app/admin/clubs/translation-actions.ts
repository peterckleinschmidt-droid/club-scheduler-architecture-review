'use server';
import { requireRole } from '@/lib/auth';
import { z } from 'zod';

export type SpanishSuggestionResult = {
  ok: boolean;
  message: string;
  translation?: { clubTitle: string; sectionLabel: string; description: string };
};
const ResultSchema = z.object({
  clubTitle: z.string().trim().max(160),
  sectionLabel: z.string().trim().max(160),
  description: z.string().trim().max(1200),
});
function clean(value: unknown, maximum: number) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maximum);
}
export async function suggestSpanishTranslation(input: {
  clubTitle: string;
  sectionLabel?: string;
  description?: string;
}): Promise<SpanishSuggestionResult> {
  await requireRole(['admin']);
  const clubTitle = clean(input.clubTitle, 160);
  const sectionLabel = clean(input.sectionLabel, 160);
  const description = clean(input.description, 1200);
  if (!clubTitle) return { ok: false, message: 'Enter the English club name first.' };
  const enabled = process.env.AI_TRANSLATION_ENABLED === 'true';
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const endpoint = process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
  const model = process.env.TRANSLATION_MODEL || 'google/gemini-2.5-flash';
  if (!enabled || !apiKey) return { ok: false, message: 'Translation suggestions are not available right now. You can still enter Spanish yourself.' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, temperature: 0.1, max_tokens: 500,
        messages: [
          { role: 'system', content: 'Translate public elementary-school club information from American English into clear, neutral Spanish for students in grades 3 through 5. Preserve names, acronyms, brands, numbers, and room names. Do not add facts or activities. Return JSON only with string fields clubTitle, sectionLabel, and description. Use an empty sectionLabel when none was supplied.' },
          { role: 'user', content: JSON.stringify({ clubTitle, sectionLabel, description }) },
        ],
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    const responseText = await response.text();
    let json: any = {};
    try { json = JSON.parse(responseText); } catch { json = {}; }
    if (!response.ok) {
      console.error('Spanish suggestion Gateway response', { status: response.status, body: responseText.slice(0, 2000) });
      throw new Error('Translation service returned status ' + response.status + '.');
    }
    const content = String(json?.choices?.[0]?.message?.content || '{}').trim();
    const jsonText = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = ResultSchema.safeParse(JSON.parse(jsonText));
    if (!parsed.success) throw new Error('The translation service returned an incomplete suggestion.');
    return { ok: true, message: 'Spanish suggestion added. Please read it before marking it ready.', translation: parsed.data };
  } catch (error) {
    console.error('Spanish suggestion failed', error);
    return { ok: false, message: 'Could not suggest Spanish right now. You can still enter Spanish yourself.' };
  } finally {
    clearTimeout(timeout);
  }
}
