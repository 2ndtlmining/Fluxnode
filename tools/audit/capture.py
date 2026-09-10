#!/usr/bin/env python3
"""Snapshot the upstream data the site computes from, so app and reference
recompute over IDENTICAL bytes.

This exists because the obvious approach does not work. Comparing a figure the
app computed at T1 against upstream data fetched at T2 produces false positives
all day -- node counts, prices and block heights all move between the two
reads. Capturing once and feeding both sides the same file removes the timing
variable entirely, and makes a run reproducible months later.

Usage:
    python tools/audit/capture.py                 # -> fixtures/<UTC stamp>/ + fixtures/latest
    python tools/audit/capture.py --label pre-fix # a named snapshot you can diff against

Fixtures are gitignored. They are evidence for one audit run, not source.
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"

# Every upstream this audit reads. Keyed by the filename written into the
# snapshot; `domains` records which audit domain consumes it, so a partial
# capture still says what it can and cannot support.
SOURCES = {
    "getzelnodecount.json": {
        "url": "https://api.runonflux.io/daemon/getzelnodecount",
        "domains": ["D1"],
        "why": "cumulus/nimbus/stratus-enabled -- the divisor in every per-node reward projection",
    },
    "fluxinfo.json": {
        "url": "https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Names,apps.resources",
        "domains": ["D2"],
        "why": "canonical running-apps source (never api.runonflux.io -- that counts ORDERED, not running)",
    },
    "fluxnodes.json": {
        "url": "https://explorer.runonflux.io/api/status?q=getFluxNodes",
        "domains": ["D4"],
        "why": "ip -> tier and payment_address; the tier grouping every rank is computed within",
    },
    "benchmarks.json": {
        "url": "https://stats.runonflux.io/fluxinfo?projection=benchmark",
        "domains": ["D4"],
        "why": "eps/ddwrite/download_speed/upload_speed -- the metrics nodes are ranked by",
    },
    "geolocation.json": {
        "url": "https://stats.runonflux.io/fluxinfo?projection=geolocation",
        "domains": ["D4"],
        "why": "country grouping for country-relative ranks and countryTierCounts",
    },
}

# The explorer rejects the default Python-urllib User-Agent outright. Cost a
# confusing failure once already; do not remove.
HEADERS = {"User-Agent": "Mozilla/5.0 (FluxNode calculation audit)"}


def fetch(url, timeout=45):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", help="name this snapshot instead of using a UTC timestamp")
    parser.add_argument("--only", help="capture a single source by filename")
    args = parser.parse_args()

    stamp = args.label or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = FIXTURES / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "sources": {},
        "failures": {},
    }

    for filename, spec in SOURCES.items():
        if args.only and filename != args.only:
            continue
        print("fetching %-22s %s" % (filename, spec["url"]))
        try:
            payload = fetch(spec["url"])
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
            # A failed source is recorded rather than fatal: a D1-only run is
            # still worth having when the D2 upstream is down.
            print("  FAILED: %s" % exc)
            manifest["failures"][filename] = str(exc)
            continue

        (out_dir / filename).write_text(json.dumps(payload, indent=2), encoding="utf-8")
        manifest["sources"][filename] = {
            "url": spec["url"],
            "domains": spec["domains"],
            "why": spec["why"],
            "bytes": len(json.dumps(payload)),
        }
        print("  ok (%d bytes)" % manifest["sources"][filename]["bytes"])

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # `latest` is what the app side and the reference both read. A copy, not a
    # symlink: Windows needs elevation for symlinks and this must work for
    # everyone on the team.
    latest = FIXTURES / "latest"
    latest.mkdir(parents=True, exist_ok=True)
    for item in out_dir.iterdir():
        (latest / item.name).write_bytes(item.read_bytes())

    print("\nsnapshot: %s" % out_dir)
    print("latest:   %s" % latest)
    if manifest["failures"]:
        print("\n%d source(s) failed -- domains depending on them cannot be audited from this snapshot:" % len(manifest["failures"]))
        for filename, error in manifest["failures"].items():
            print("  %s (%s): %s" % (filename, ",".join(SOURCES[filename]["domains"]), error))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
