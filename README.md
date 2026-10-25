# School Club Scheduler

Production-oriented Next.js + Supabase app for elementary school club scheduling.

## Quick start
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/001_initial_schema.sql`, then `002_rls_policies.sql`, then `003_functions.sql`.
3. Enable Google OAuth in Supabase Auth and restrict Google OAuth to your school domain in the Google Cloud OAuth consent/app settings. Also set `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAIN`.
4. Copy `.env.example` to `.env.local` and fill values.
5. Install and run:
   ```bash
   npm install
   npm run dev
   ```
6. Bootstrap the first admin:
   - Sign in once with Google.
   - In Supabase SQL Editor, run `supabase/seed/admin_bootstrap.sql` after replacing the email.
7. Deploy to Vercel and set the same environment variables.

## Notes
- Sponsor / Host / Leader is intentionally a free-text field in `club_offerings.sponsor_name`.
- Teacher roster is only for homeroom/student organization.
- Operational persistence is Supabase/Postgres only. No localStorage is used.
- Matching is server-side in `lib/matching/engine.ts` and persists to `match_runs` and `draft_assignments`.
