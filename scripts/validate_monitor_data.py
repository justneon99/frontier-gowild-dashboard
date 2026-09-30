#!/usr/bin/env python3
"""Validate public dashboard data without exposing account information."""

import json
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
AIRPORTS = {"SJC", "SFO", "SLC", "LAX", "SAN", "LAS", "DEN", "MCO", "CLT", "CUN", "SJO", "GUA", "SAL", "SAP", "EWR", "LGA", "SEA", "ATL", "TPA"}


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
    routes = load("routes.json")
    live = load("gowild-availability.json")
    history = load("fare-history.json")
    assert isinstance(routes["routes"], list)
    pairs = set()
    for route in routes["routes"]:
        a, b = route["a"], route["b"]
        assert a in AIRPORTS and b in AIRPORTS and a != b
        pair = tuple(sorted((a, b)))
        assert pair not in pairs
        pairs.add(pair)
        assert route["status"] in {"active", "seasonal"}
        assert len(route["days"]) == 7 and all(day in {0, 1, None} for day in route["days"])
        if route["status"] == "seasonal":
            assert route.get("starts")
            datetime.fromisoformat(route["starts"])
        parsed = urlparse(route["source"])
        assert parsed.scheme == "https" and parsed.hostname
    assert len(pairs) == len(routes["routes"])
    assert live["schemaVersion"] == 1
    assert live["status"] in {"login_required", "ready", "checked", "available", "disabled", "error"}
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
        assert item["currency"] == "USD"
        assert 0 <= float(item["displayedTotal"]) < 100
    assert history["schemaVersion"] == 1
    iso(history["updatedAt"])
    assert isinstance(history["observations"], list)
    for item in history["observations"]:
        origin, destination = item["route"].split("→")
        assert origin in AIRPORTS and destination in AIRPORTS and origin != destination
        assert tuple(sorted((origin, destination))) in pairs
        assert item["nonstop"] is True
        assert item["currency"] == "USD"
        assert 0 <= float(item["amount"]) < 100
        datetime.fromisoformat(item["travelDate"])
        iso(item["observedAt"])
        frontier_url(item["source"])
    print(f"Validated {len(live['availability'])} GoWild results and {len(history['observations'])} public fare observations.")


if __name__ == "__main__":
    main()
