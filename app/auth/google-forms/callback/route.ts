import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeReturnTo(value: string | null) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) return '/admin/workflow';
  if (!trimmed.startsWith('/admin')) return '/admin/workflow';
  if (trimmed.startsWith('//')) return '/admin/workflow';

  return trimmed;
}

function appendStatus(path: string, status: 'connected' | 'connection-failed') {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}googleForms=${status}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = safeReturnTo(requestUrl.searchParams.get('returnTo'));

  if (!code) {
    return NextResponse.redirect(
      new URL(appendStatus(returnTo, 'connection-failed'), requestUrl.origin)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(appendStatus(returnTo, 'connection-failed'), requestUrl.origin)
    );
  }

  return NextResponse.redirect(
    new URL(appendStatus(returnTo, 'connected'), requestUrl.origin)
  );
}