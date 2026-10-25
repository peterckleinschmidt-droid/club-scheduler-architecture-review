'use client';

import { createClient } from '@/lib/supabase/client';

const GOOGLE_WORKSPACE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.projects',
].join(' ');

export function LoginButton({ selectAccount = false }: { selectAccount?: boolean }) {
  async function login() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: GOOGLE_WORKSPACE_SCOPES,
        queryParams: {
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: selectAccount ? 'select_account consent' : 'consent',
        },
      },
    });

    if (error) {
      alert(error.message);
      console.error(error);
      return;
    }

    if (data?.url) {
      window.location.href = data.url;
    }
  }

  return (
    <button
      type="button"
      onClick={login}
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #cbd5e1',
        background: 'white',
        cursor: 'pointer',
        fontSize: '16px',
      }}
    >
      {selectAccount ? 'Choose Google account' : 'Sign in with Google'}
    </button>
  );
}
