Scheduler Google Health Status Package

Files included:
- app/admin/google-health/actions.ts
- components/admin-google-health-status.tsx
- app/admin/prepare-form/connect-google-client.tsx
- app/auth/google-forms/callback/route.ts

This package adds a reusable AdminGoogleHealthStatus component intended to be placed in app/admin/layout.tsx so every admin page can show a Google connection check without editing each page individually.

Manual layout edit needed:
1. Open app/admin/layout.tsx
2. Add:
   import AdminGoogleHealthStatus from '@/components/admin-google-health-status';
3. Place:
   <AdminGoogleHealthStatus />
   somewhere after the admin nav and before {children}.

After install:
1. npm run build
2. npm run dev
3. Open any admin page
4. Click Check Google
5. If disconnected, click Reconnect Google and confirm you return to the same page.
