# Dashboard end-to-end tests (Playwright)

Drives the real dashboard in a browser against a freshly-seeded database.

## Run

```bash
cd apps/server
npx playwright install chromium   # first time only (downloads the browser)
npm run e2e                       # headless
npm run e2e:ui                    # interactive UI mode
```

`npm run e2e` (via `playwright.config.ts`) automatically:

1. **Seeds a throwaway DB** — `e2e/prepare-db.mjs` recreates `e2e-test.db`
   (SQLite), applies migrations and runs the demo seed (parent
   `demo@kidora.app` / `kidora1234`, children *Emma* & *Lucas*).
2. **Builds & serves a production bundle** — `next build` + `next start` on port
   `3100`. We use a production build, **not `next dev`**: under Turbopack dev the
   HMR websocket can't complete its handshake inside headless Chromium and the
   page then never hydrates (every form/button is inert). `next start` has no HMR
   and hydrates reliably. The `Secure` session cookie still works because
   Chromium treats `http://127.0.0.1` as a secure context.
3. **Runs the specs** against it, then tears the server down.

## Coverage

- `login.spec.ts` — login form renders, demo login reaches the dashboard, the
  demo-prefill button, wrong credentials show an error and stay on `/login`, and
  an unauthenticated `/dashboard` visit redirects to `/login`.
- `dashboard.spec.ts` — open a child's detail, navigate to alerts & settings,
  and log out (session cleared → `/dashboard` bounces back to `/login`).

## Notes

- Sequential, single worker, one shared seeded DB — deterministic.
- Locally, `reuseExistingServer` is on: re-running many times within 5 minutes
  can trip the in-memory login rate-limiter on the reused server. In CI
  (`CI=1`) a fresh server is started each run, so this never bites.
- Artifacts (`test-results/`, `playwright-report/`, `e2e-test.db`) are
  git-ignored.
