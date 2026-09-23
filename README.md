# Frontier GoWild Flight Radar

Public dashboard: <https://justneon99.github.io/frontier-gowild-dashboard/>

To move monitoring to another ChatGPT account with Work Cloud, use [CLOUD_ACCOUNT_HANDOFF.md](CLOUD_ACCOUNT_HANDOFF.md).

The dashboard separates three kinds of information:

- Frontier nonstop routes and representative weekday schedules.
- Public Standard and Discount Den fare observations stored in `dist/data/fare-history.json`.
- Authenticated GoWild inventory stored in `dist/data/gowild-availability.json` only after it is verified on Frontier's official booking site.

The public data never stores Frontier credentials, account identifiers, traveler details, cookies, or payment information. A local scheduled monitor reuses the user's signed-in browser session, queries one-way nonstop flights for one traveler, and writes only flight availability, displayed price, timestamps, and an official booking link. Booking and payment always require user confirmation on Frontier.

The monitor alerts only when a new GoWild itinerary appears, a displayed total changes, a previously unavailable itinerary becomes available again, or login/CAPTCHA requires attention. Alert keys prevent duplicate notifications.

Validate the deployable data and JavaScript before publishing:

```sh
python3 scripts/validate_monitor_data.py
python3 /Users/haoday/.codex/skills/frontier-airport-expander/scripts/validate_dashboard.py dist/index.html
```


Only save, display, or alert on USD fares strictly below $100, including displayed taxes and fees. Discard fares of $100 or more before storing observations; never replace them with zero. Apply this to Standard, Discount Den and GoWild. Frontier may return expensive options in its search results; do not persist them. Cycle through all eligible routes in both directions across SJC, SFO, SLC, LAX, SAN, LAS and DEN. Resume previously unchecked directions first and rotate origins rather than always starting with SFO. Persist a non-sensitive route/date coverage cursor locally. Mark interrupted runs as partial and distinguish unchecked routes from checked routes with no qualifying low fare.
