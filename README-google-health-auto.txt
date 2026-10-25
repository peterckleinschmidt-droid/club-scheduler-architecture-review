Scheduler Google Health Auto-Check Package

File included:
- components/admin-google-health-status.tsx

What changed:
- Runs the Google health check automatically when an admin page loads.
- Shows a compact green status if Google is working.
- Shows an amber warning and Reconnect Google button if Google needs attention.
- Keeps a Check again button for manual troubleshooting.

After installing:
1. npm run build
2. npm run dev
3. Open any /admin page
4. Confirm the health status checks automatically
5. If disconnected, use Reconnect Google and confirm it returns to the same page
