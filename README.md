# Frontier GoWild 航班雷达

Website: <https://justneon99.github.io/frontier-gowild-dashboard/>

The home page is a trip-planning app for 19 supported airports: SJC, SFO, SLC, LAX, SAN, LAS, DEN, MCO, CLT, CUN, SJO, GUA, SAL, SAP, EWR, LGA, SEA, ATL, and TPA. It lists every operating date in the selected range from verified Frontier nonstop route patterns, labels GoWild blackout dates separately, shows indicative public fare evidence, and calculates a booking-check reminder in the departure airport's local time. Dates are never ranked, spaced out, or removed based on fare observations or budget. Elapsed check times remain visible with a Check now link instead of a past calendar reminder. Public fare estimates do not predict GoWild prices or inventory. Domestic reminders are one day before departure; international reminders are 10 days before departure. The prior dashboard remains at `dist/legacy.html`.

The estimate is intentionally labeled as uncertain: existing observations are concentrated on fares below $100, and a fare observed for one travel date is not a quote for another date. Public Standard and Discount Den fares never represent authenticated GoWild inventory. The current schedule file is representative, not a live flight search. Newly added airports have schedule coverage but no verified public fare observations yet; they remain explicitly unverified until the next price refresh.

## Local checks

```sh
node --test tests/*.test.mjs
node --check dist/app.mjs
node --check worker/src/index.mjs
python3 scripts/validate_monitor_data.py
python3 /Users/haoday/.codex/skills/frontier-airport-expander/scripts/validate_dashboard.py dist/legacy.html
python3 -m http.server 8765 --directory dist
```

`dist/config.json` has an empty `apiBase` until the mail backend is deployed. The website then offers `.ics` download and clearly marks email reminders unavailable. Do not insert API keys or email credentials into any file under `dist/` or Git.

## Email and calendar backend

`worker/src/index.mjs` contains a Cloudflare Worker using D1, Resend, and a five-minute cron. It supports email-link registration/sign-in, saved reminders, `.ics` invitations, updates/cancellations, and a due-time email. The user must accept the calendar invitation in their calendar app; the website cannot force a calendar notification. The server stores only verified email addresses, session hashes, and trip/reminder metadata. Frontier login and payment details are not involved.

The separate Admin page at `dist/admin.html` is available only after the verified owner signs in as `howardyangemail@gmail.com`. The Worker, not the browser, checks `ADMIN_EMAIL` on every admin request. Admin can email a single-use, seven-day account invitation, view account creation and last sign-in times plus reminder counts, cancel pending invitations, revoke access, and restore a revoked account. New accounts require an invitation; the owner account bootstraps through its verified email sign-in link. Revocation invalidates sessions and login links and cancels future email reminders. It does not remove calendar entries previously accepted by the recipient or delete historical account data.

To activate it, a Cloudflare account and a Resend sending domain are required:

1. Sign in with Wrangler (`npx wrangler login`) and create D1 (`npx wrangler d1 create frontier-gowild-reminders`). Put the returned database ID in `worker/wrangler.jsonc`.
2. Apply `worker/schema.sql` to a new D1 database. For an existing database created before Admin, apply `worker/migrations/001_admin_access.sql` instead. Configure `RESEND_API_KEY` and `MAIL_FROM` as Worker secrets; `MAIL_FROM` must use a verified sending domain. Confirm `ADMIN_EMAIL` in `worker/wrangler.jsonc` before deployment.
3. Deploy the Worker, set its `workers.dev` HTTPS URL as `apiBase` in `dist/config.json`, and publish the static site. Never commit Worker secrets.
4. Test the owner login and an invited account end to end: accept the account invitation, save a trip, accept the emailed `.ics`, change/cancel it, revoke access, and verify the due-time email. Check Gmail, Apple Calendar, and Outlook handling before treating all three as supported.

The Worker rejects unsupported routes, expired windows, invalid reminder times, unverified sessions, and other website origins. Login links expire after 15 minutes. Sessions expire after 30 days. Email requests use provider idempotency keys. `worker/wrangler.jsonc` intentionally contains a database ID placeholder, so backend deployment is not complete until it is replaced.

Source for booking windows and blackout dates: [Frontier GoWild official page](https://www.flyfrontier.com/deals/gowild-pass/). Service implementation references: [Cloudflare Workers Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Cloudflare D1](https://developers.cloudflare.com/d1/worker-api/), [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email).

Airport opportunity totals combine current and planned nonstop service, counting each destination once. SFO–SLC keeps one bidirectional route with a dated schedule-source note; public fare offers alone do not verify earlier Frontier nonstop dates.

Support links point to https://ko-fi.com/gowildradar. Payment setup and transactions stay on Ko-fi.

ATL/TPA expansion evidence: `docs/atl-tpa-review-2026-09-29.md`. New routes without verified nonstop fare itineraries keep prices unverified.
