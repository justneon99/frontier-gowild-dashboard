#!/usr/bin/env python3
"""Validate public dashboard data without exposing account information."""

import json
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
AIRPORTS = {"SJC", "SFO", "SLC", "LAX", "SAN", "LAS", "DEN"}


def load(name):
    with (DATA / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def iso(value):
    if value is not None:
        datetime.fromisoformat(value.replace("Z", "+00:00"))


def frontier_url(value):
    parsed = urlparse(value)
    assert parsed.scheme == "https"
    assert parsed.hostname == "flyfrontier.com" or parsed.hostname.endswith(".flyfrontier.com")


def main():
    live = load("gowild-availability.json")
    history = load("fare-history.json")
    assert live["schemaVersion"] == 1
    assert live["status"] in {"login_required", "ready", "checked", "available", "error"}
    assert isinstance(live["authenticated"], bool)
    iso(live.get("lastAttemptAt"))
    iso(live.get("lastSuccessfulAt"))
    assert isinstance(live["checkedFlights"], int) and live["checkedFlights"] >= 0
    assert isinstance(live["availability"], list)
    for item in live["availability"]:
        assert item["origin"] in AIRPORTS and item["destination"] in AIRPORTS
        assert item["origin"] != item["destination"]
        iso(item["departureAt"])
        iso(item["observedAt"])
        frontier_url(item["bookingUrl"])
        assert float(item["displayedTotal"]) >= 0
    assert history["schemaVersion"] == 1
    iso(history["updatedAt"])
    assert isinstance(history["observations"], list)
    for item in history["observations"]:
        origin, destination = item["route"].split("→")
        assert origin in AIRPORTS and destination in AIRPORTS and origin != destination
        assert item["nonstop"] is True
        assert float(item["amount"]) >= 0
        datetime.fromisoformat(item["travelDate"])
        iso(item["observedAt"])
        frontier_url(item["source"])
    print(f"Validated {len(live['availability'])} GoWild results and {len(history['observations'])} public fare observations.")


if __name__ == "__main__":
    main()
