import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function normalizedEmail(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function allowedDomains() {
  return String(process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
}

function emailMatchesAllowedDomain(email: string) {
  const domains = allowedDomains();

  if (domains.length === 0) return true;

  return domains.some((domain) => email.endsWith(`@${domain}`));
}

function isAdminRole(role: unknown) {
  return String(role ?? '').trim().toLowerCase() === 'admin';
}

async function getAppUserForAuthUser({
  supabase,
  userId,
  email,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string;
}) {
  const { data: userById, error: userByIdError } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .maybeSingle();

  if (!userByIdError && userById) {
    return userById;
  }

  const { data: userByEmail, error: userByEmailError } = await supabase
    .from('users')
    .select('id, email, role')
    .ilike('email', email)
    .maybeSingle();

  if (!userByEmailError && userByEmail) {
    return userByEmail;
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const supabase = await createClient();

  if (!code) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
    code
  );

  if (exchangeError) {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = normalizedEmail(user?.email);

  if (!user || !email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  const appUser = await getAppUserForAuthUser({
    supabase,
    userId: user.id,
    email,
  });

  const isAdmin = isAdminRole(appUser?.role);
  const isAllowedDomain = emailMatchesAllowedDomain(email);

  if (!isAllowedDomain && !isAdmin) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  if (isAdmin) {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return NextResponse.redirect(new URL('/', request.url));
}
