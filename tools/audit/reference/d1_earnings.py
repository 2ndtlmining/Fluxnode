#!/usr/bin/env python3
"""Domain D1 -- earnings and reward projections, recomputed INDEPENDENTLY.

The whole value of this file is that it is NOT a transcription of
client/src/apidata.js. Every formula below is derived from documented protocol
facts and re-stated here; if it were ported from the app, it would reproduce the
app's bugs and agree with them perfectly, which is exactly the failure mode this
audit exists to avoid. When this disagrees with the app, one of the two is
wrong and BOTH are worth reading before deciding which.

Derivation, from the Flux protocol rather than from the app:

  blocks/day      Flux targets a 30-second block. 86400 / 30 = 2880.
  network per day A tier's share of the block subsidy, every block, all day:
                    2880 * subsidy * (tier_share_pct / 100)
  per node        Payment rotates through a tier's nodes in order, so over a
                  day a tier's emission divides evenly across its members:
                    network_per_day / node_count
  pay frequency   One full rotation is node_count blocks. At 30s each that is
                    node_count * 30 seconds = node_count / 2 minutes
  parallel asset  A configured percentage of the native reward:
                    per_node * (pa_pct / 100)
  APY             Annualised return on the tier's locked collateral:
                    100 * ((per_node + pa_amount) * 365) / collateral

Constants are READ FROM PRODUCTION (client/public/runtime/app-content.js), not
hardcoded here. That is deliberate: it means this reference audits the values
the site actually ships, and a constant edited in production without a matching
test-double update is caught by the parity test rather than silently passing.
"""

import json
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]
APP_CONTENT = REPO / "client" / "public" / "runtime" / "app-content.js"
FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "latest"

SECONDS_PER_DAY = 86_400
BLOCK_TARGET_SECONDS = 30
BLOCKS_PER_DAY = SECONDS_PER_DAY // BLOCK_TARGET_SECONDS  # 2880

TIERS = ("CUMULUS", "NIMBUS", "STRATUS")


def read_production_constants():
    """Parse the constants the deployed site actually uses.

    Regex rather than a JS parser on purpose: app-content.js is a flat list of
    `window.gContent.NAME = value;` assignments with no logic, and adding a JS
    runtime dependency to read ten numbers would not be a trade worth making.
    A malformed value raises here rather than silently defaulting -- an audit
    that quietly substitutes a guess is worse than one that stops.
    """
    text = APP_CONTENT.read_text(encoding="utf-8")
    constants = {}
    for match in re.finditer(r"window\.gContent\.(CC_[A-Z_]+)\s*=\s*([0-9.]+)\s*;", text):
        constants[match.group(1)] = float(match.group(2))

    required = (
        ["CC_BLOCK_REWARD", "CC_PA_REWARD"]
        + ["CC_FLUX_REWARD_%s" % t for t in TIERS]
        + ["CC_COLLATERAL_%s" % t for t in TIERS]
    )
    missing = [name for name in required if name not in constants]
    if missing:
        raise SystemExit("app-content.js is missing required constants: %s" % ", ".join(missing))
    return constants


def read_node_counts():
    path = FIXTURES / "getzelnodecount.json"
    if not path.exists():
        raise SystemExit(
            "no fixture at %s -- run `python tools/audit/capture.py` first" % path
        )
    payload = json.loads(path.read_text(encoding="utf-8"))

    # The daemon wraps its payload; the site reads `data`. Accept either shape
    # rather than assuming, since a wrapper change would otherwise look like
    # a calculation error rather than a shape change.
    stats = payload.get("data", payload)

    counts = {}
    for tier in TIERS:
        key = "%s-enabled" % tier.lower()
        if key not in stats:
            raise SystemExit("fixture has no '%s' -- upstream shape changed?" % key)
        counts[tier] = int(stats[key])
        if counts[tier] <= 0:
            # Guarding explicitly: a zero would make every per-node figure
            # infinite, and an audit reporting `inf` teaches nobody anything.
            raise SystemExit("fixture reports %d %s nodes -- refusing to divide by that" % (counts[tier], tier))
    return counts


def compute(constants, counts):
    subsidy = constants["CC_BLOCK_REWARD"]
    pa_pct = constants["CC_PA_REWARD"]

    projections = {}
    for tier in TIERS:
        share_pct = constants["CC_FLUX_REWARD_%s" % tier]
        collateral = constants["CC_COLLATERAL_%s" % tier]
        node_count = counts[tier]

        network_per_day = BLOCKS_PER_DAY * subsidy * (share_pct / 100.0)
        per_node = network_per_day / node_count
        pa_amount = per_node * (pa_pct / 100.0)

        projections[tier.lower()] = {
            "pay_frequency": node_count / 2.0,          # minutes
            "payment_amount": per_node,                 # FLUX/day
            "pa_amount": pa_amount,                     # FLUX/day
            "apy": 100.0 * ((per_node + pa_amount) * 365.0) / collateral,
        }

    # A sanity check the app never makes: the three tier shares plus the dev
    # fund must account for the whole subsidy. If they do not, one of the
    # percentages is wrong regardless of whether app and reference agree.
    tier_share_total = sum(constants["CC_FLUX_REWARD_%s" % t] for t in TIERS)
    projections["_meta"] = {
        "blocks_per_day": BLOCKS_PER_DAY,
        "block_subsidy": subsidy,
        "tier_share_pct_total": tier_share_total,
        "implied_dev_fund_pct": 100.0 - tier_share_total,
        "node_counts": {t.lower(): counts[t] for t in TIERS},
    }
    return projections


def main():
    constants = read_production_constants()
    counts = read_node_counts()
    result = compute(constants, counts)

    out = FIXTURES / "reference-d1.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    meta = result["_meta"]
    print("reference D1 written to %s" % out)
    print("  block subsidy      %s FLUX over %d blocks/day" % (meta["block_subsidy"], meta["blocks_per_day"]))
    print("  tier shares total  %.3f%%  (implied dev fund %.3f%%)" % (meta["tier_share_pct_total"], meta["implied_dev_fund_pct"]))
    for tier in TIERS:
        p = result[tier.lower()]
        print("  %-8s %8d nodes  %10.6f FLUX/day  APY %6.2f%%"
              % (tier.lower(), meta["node_counts"][tier.lower()], p["payment_amount"], p["apy"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
