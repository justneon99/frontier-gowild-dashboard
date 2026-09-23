# Move the GoWild monitor to another ChatGPT account

Use an account that has **ChatGPT Work**, **Cloud browser**, **Scheduled tasks**, and an enabled **Gmail connector**. Cloud browser has a separate session from the original computer, so sign in to Frontier and Gmail again when the secure takeover flow appears.

The current dashboard and source repository are public:

- Dashboard: <https://justneon99.github.io/frontier-gowild-dashboard/>
- Repository: <https://github.com/justneon99/frontier-gowild-dashboard>
- Live GoWild state: `dist/data/gowild-availability.json`
- Public fare history: `dist/data/fare-history.json`

Do not disable the existing local monitor until the cloud task has completed one authenticated Frontier search and one scheduled test run.

## Prompt to paste into ChatGPT Work

> Create a cloud-browser scheduled monitor for Frontier Airlines GoWild inventory. It must continue running when my computer is off.
>
> Use only official Frontier properties under `flyfrontier.com` or `booking.flyfrontier.com` for authenticated inventory. Monitor one-way, one-adult, Frontier-operated nonstop flights in both directions among SJC, SFO, SLC, LAX, SAN, LAS, DEN, and SEA, for departures 18–42 hours from each check. Treat only a fare explicitly labeled GoWild or GoWild! Pass in an authenticated official result as GoWild availability. Keep Standard and Discount Den fares separate and never infer GoWild from a low ordinary price.
>
> Create active cloud schedules in `America/Los_Angeles`. Start a midnight monitoring run at 12:00 AM Pacific and, within that run, recheck at 12:01, 12:02, 12:04, 12:08, 12:16, 12:32, and 1:00 AM Pacific. Also check at 12:00 PM America/Denver and 12:00 PM America/Los_Angeles. If the scheduler cannot express both noon time zones in one task, create the minimum number of cloud schedules required. Stay quiet when results are unchanged and no action is needed.
>
> Use the cloud browser's persistent Frontier session. I explicitly authorize using my connected Gmail only to locate a newly received Frontier sign-in verification email and extract its one-time code, then enter that code only into the official `flyfrontier.com` or `booking.flyfrontier.com` sign-in flow. Limit this to the newest relevant email received within the preceding 10 minutes from an official Frontier sender. Never reveal the code in chat, logs, summaries, dashboard data, or any other destination. Never use a code for password reset, profile changes, payment, or another site. If the sender, destination domain, timing, or purpose is uncertain, pause and ask me to take over. Complete the initial Gmail connection and Frontier secure sign-in through the cloud browser takeover flow whenever required by ChatGPT or Frontier.
>
> When a new GoWild itinerary appears, its displayed total changes, or it reappears after being unavailable, notify me immediately with route, local departure time, flight number, displayed total and visible fee components, observation time, and the exact official Frontier booking link. Deduplicate unchanged alerts. Do not purchase, hold, add extras, enter traveler details, or submit payment; I will make the final booking.
>
> The public dashboard is `https://justneon99.github.io/frontier-gowild-dashboard/` and its source is `https://github.com/justneon99/frontier-gowild-dashboard`. If this account has authorized GitHub write access, update `dist/data/gowild-availability.json` after authenticated checks and append public Standard and Discount Den observations to `dist/data/fare-history.json`. Never store credentials, Gmail contents, one-time codes, account identifiers, traveler details, cookies, or payment data. Preserve the documented schema, validate the data, and publish `main`. If repository write access is unavailable, prioritize monitoring and alerts and tell me that dashboard synchronization still needs a GitHub connection.
>
> Set up the schedules, request the secure takeover steps needed for Gmail and Frontier, run one authenticated test search, and report the next scheduled run. Do not claim migration is complete until the test search succeeds.

## Cutover checklist

1. Confirm the new account says Cloud browser is available.
2. Connect Gmail in the new account. If an administrator disabled Gmail, the migration cannot automate verification emails.
3. Complete Frontier sign-in in the cloud browser's secure takeover window.
4. Confirm the account can see an active GoWild Pass.
5. Run one authenticated nonstop search and verify that GoWild is distinguished from Standard and Discount Den.
6. Confirm the cloud schedules are active and note their next run times.
7. Confirm a test alert arrives without exposing the verification code.
8. If dashboard synchronization is required, authorize GitHub write access and confirm that a test data-only commit deploys successfully.
9. Return to the original Codex task and pause the local monitor only after steps 1–8 pass.

Authentication sessions can expire, Frontier can require user takeover, and Frontier may block cloud-browser traffic. The task must report these states rather than treating a failed login as “no GoWild availability.”
