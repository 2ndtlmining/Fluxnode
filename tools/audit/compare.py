#!/usr/bin/env python3
"""Diff the app's own output against the independent reference, and report.

This is the step that produces a verdict. Everything before it just generates
the two sides.

Usage:
    python tools/audit/compare.py
    python tools/audit/compare.py --tolerance 1e-9

Exit codes: 0 = agree, 1 = disagreement found, 2 = cannot run (missing input).
A disagreement is NOT automatically an app bug -- the reference can be wrong
too. It means one of the two is, and both are worth reading.
"""

import argparse
import json
import pathlib
import sys

FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures" / "latest"

# Floating-point arithmetic in two languages will not agree bit-for-bit, and
# demanding that would produce noise rather than findings. This tolerance is
# RELATIVE and tight enough that any real formula difference -- a wrong
# constant, a dropped term, an off-by-one divisor -- lands far outside it,
# while IEEE-754 ordering differences land far inside.
DEFAULT_TOLERANCE = 1e-9

FIELD_MEANINGS = {
    "pay_frequency": "minutes between payments for one node",
    "payment_amount": "FLUX per day per node",
    "pa_amount": "parallel-asset FLUX per day per node",
    "apy": "annual percentage yield on collateral",
}


def load(name):
    path = FIXTURES / name
    if not path.exists():
        return None, path
    return json.loads(path.read_text(encoding="utf-8")), path


def relative_difference(a, b):
    if a == b:
        return 0.0
    scale = max(abs(a), abs(b))
    if scale == 0:
        return 0.0
    return abs(a - b) / scale


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tolerance", type=float, default=DEFAULT_TOLERANCE)
    args = parser.parse_args()

    app, app_path = load("appside-d1.json")
    ref, ref_path = load("reference-d1.json")

    if app is None:
        print("missing %s" % app_path)
        print("  run: cd client && CI=true npx react-scripts test --watchAll=false d1AppSide")
        return 2
    if ref is None:
        print("missing %s" % ref_path)
        print("  run: python tools/audit/reference/d1_earnings.py")
        return 2

    meta = ref.pop("_meta", {})

    print("=" * 74)
    print("D1 EARNINGS -- app vs independent reference")
    print("=" * 74)
    if meta:
        print("block subsidy %s over %s blocks/day; tier shares total %.3f%% "
              "(implied dev fund %.3f%%)"
              % (meta.get("block_subsidy"), meta.get("blocks_per_day"),
                 meta.get("tier_share_pct_total", 0.0), meta.get("implied_dev_fund_pct", 0.0)))
        print()

    disagreements = []
    for tier in sorted(ref):
        if tier not in app:
            disagreements.append((tier, "-", "missing from app output", "", ""))
            continue

        print("%s (%s nodes)" % (tier.upper(), meta.get("node_counts", {}).get(tier, "?")))
        for field in sorted(ref[tier]):
            ref_value = ref[tier][field]
            if field not in app[tier]:
                disagreements.append((tier, field, "missing from app output", "", ""))
                continue
            app_value = app[tier][field]
            delta = relative_difference(app_value, ref_value)
            agrees = delta <= args.tolerance
            print("  %-16s app=%-20.10f ref=%-20.10f %s"
                  % (field, app_value, ref_value, "ok" if agrees else "MISMATCH"))
            if not agrees:
                disagreements.append((tier, field, "relative delta %.3e" % delta, app_value, ref_value))
        print()

    if not disagreements:
        print("AGREE -- every D1 figure matches the independent reference "
              "within %g relative tolerance." % args.tolerance)
        print()
        print("Note what this does and does not establish. It shows the app's "
              "arithmetic matches an independently-derived formula over the "
              "same inputs. It does NOT establish that the INPUTS are right -- "
              "a stale CC_BLOCK_REWARD would agree perfectly here while being "
              "wrong on-chain (see issue #202).")
        return 0

    print("-" * 74)
    print("%d DISAGREEMENT(S)" % len(disagreements))
    print("-" * 74)
    for tier, field, detail, app_value, ref_value in disagreements:
        meaning = FIELD_MEANINGS.get(field, "")
        print("  %s.%s %s" % (tier, field, ("-- " + meaning) if meaning else ""))
        print("      %s" % detail)
        if app_value != "":
            print("      app=%r  reference=%r" % (app_value, ref_value))
    print()
    print("One of the two is wrong. Read both before deciding which: the "
          "reference is an independent derivation, not an oracle.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
