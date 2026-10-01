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

`dist/config.json` points to the deployed Cloudflare account service and includes the public Google Web Client ID. The public trip planner always downloads an `.ics` calendar file; importing it into a calendar app is the user's action. No email reminders are sent.

## Google sign-in and Admin access (no custom domain)

The separate Admin page at `dist/admin.html` uses Google Identity Services. The Cloudflare Worker verifies the Google ID token signature and claims, then stores an opaque 30-day session hash in D1. Admin access is enforced by the Worker for `howardyangemail@gmail.com`. The admin can view accounts and invitations, create a one-time invitation link bound to a specified Google email, cancel an invitation, and revoke or restore account access. A link expires after seven days and is displayed only when created; the admin copies and shares it manually. No email service or sending domain is required. Revocation invalidates active sessions. The public trip planner and calendar downloads remain available without sign-in.

To activate Admin:

1. Create a Google OAuth **Web application** client ID, add `https://justneon99.github.io` as an authorized JavaScript origin, and use the client ID as `GOOGLE_CLIENT_ID` in `worker/wrangler.jsonc` and `googleClientId` in `dist/config.json`. Do not add a client secret to the repository.
2. Sign in to Cloudflare using Wrangler, create a D1 database, set its ID in `worker/wrangler.jsonc`, and apply `worker/schema.sql` to a new database. For an existing database that already has Admin tables, apply `worker/migrations/002_google_signin.sql` instead.
3. Deploy the Worker to its `workers.dev` HTTPS URL, set that URL as `apiBase` in `dist/config.json`, and publish the static site.
4. Test admin Google sign-in, an invitation accepted with the same email, a different-email rejection, and revocation. Calendar alerts depend on the recipient importing the downloaded `.ics` file and allowing notifications in their calendar app.

The Cloudflare account service is deployed at `https://frontier-gowild-accounts.howardyangemail.workers.dev`. The Admin page calls this API after Google sign-in. The Google OAuth client must allow `https://justneon99.github.io` as a JavaScript origin; the owner must complete an interactive sign-in to verify the full flow. The old Resend/email-reminder endpoints and cron are disabled.

## Personal GoWild booking-validation pilot

`dist/booking.html` lets the administrator create a one-way task with an exact route, travel date, origin-local departure-time range, and strict USD total cap. The Cloudflare Worker stores task metadata and manual check history in D1, accessible only to the admin's Google session. No Frontier password, code, payment card, passenger identity, or email contents are stored. A check is marked **self-reported match** only when its entered details say it is a Frontier nonstop, GoWild passholder fare, one adult, one-way, no paid extras, under the cap, and at the pre-payment review page. This label is not a verified booking or price.

The optional `extension/` is an unpacked Chrome Manifest V3 personal monitor. It reads only the booking task metadata from the administrator's `booking.html` page, and reads a matching `booking.flyfrontier.com/Flight/Select` tab already opened in Chrome. To use it:

1. In Chrome, open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose this repository's `extension/` directory. Review its permissions for the Radar page and Frontier booking results.
2. In `booking.html`, create a task and click **Send to local monitor**. In Chrome, sign in to Frontier yourself, search the same **one-way, one adult** route and date, open the extension, and click **Bind current Frontier tab**.
3. The extension checks the bound tab at origin-local midnight, then 1, 2, 4, 8, 16, 32, and 60 minutes later (domestic: one day before travel; international: ten days before). **Check now** performs one immediate scan. It requires Chrome and this computer to remain awake. If Frontier requires login or CAPTCHA, the monitor stops at that state and asks for user action. It never reads Gmail or enters an OTP.
4. A matching **listed** GoWild nonstop candidate below the cap triggers a local Chrome notification and needs a human to inspect the final checkout total. The extension does not select a fare, add services, enter payment details, or submit a purchase. On the website, record the pre-payment review details to see which criteria matched. Stop the monitor from its popup when no longer needed.

The extension keeps the current task's most recent 120 execution events in this Chrome profile and shows the latest events in its popup and on the administrator's booking page. Events record task transfer, binding, scheduled or manual checks, results, errors, and notifications. The booking page also shows the next pending alarm and remaining checks. Logs are local to this Chrome profile; they do not synchronize to the Cloudflare account service and cannot prove that Chrome ran while the computer was asleep. They exclude account credentials, verification codes, passenger and payment details. After updating the unpacked extension's source, reload it in Chrome to use the new logger.

The Frontier result-page parser was matched against the official SJC–LAX one-way search layout on 2026-09-30. Frontier can change that layout, fare labels, and session behavior at any time; an unsupported or mismatched page is reported as such rather than treated as no seats. Search-result prices are candidates only, never proof of logged-in inventory or final total. The extension is source code in this repository; it is not distributed through the Chrome Web Store. This pilot intentionally has no automatic login, checkout, payment, cloud execution, or email notification.

Implementation references: [Google Web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google sign-in button](https://developers.google.com/identity/gsi/web/guides/display-button), [Cloudflare D1](https://developers.cloudflare.com/d1/worker-api/).

Airport opportunity totals combine current and planned nonstop service, counting each destination once. SFO–SLC keeps one bidirectional route with a dated schedule-source note; public fare offers alone do not verify earlier Frontier nonstop dates.

Support links point to https://ko-fi.com/gowildradar. Payment setup and transactions stay on Ko-fi.

ATL/TPA expansion evidence: `docs/atl-tpa-review-2026-09-29.md`. New routes without verified nonstop fare itineraries keep prices unverified.
