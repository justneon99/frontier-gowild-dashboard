# Frontier GoWild Flight Radar

Public dashboard: <https://justneon99.github.io/frontier-gowild-dashboard/>

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
