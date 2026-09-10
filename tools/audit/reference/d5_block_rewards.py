#!/usr/bin/env python3
"""Domain D5 -- coinbase reward extraction, checked against real blocks.

client/src/live/apidata.js's extractRewardsFromCoinbase classifies each coinbase
output by its share of the block's total output, matching the known tier splits
within a +/-0.5 percentage-point tolerance, plus a hardcoded dev-fund address.

The part worth auditing is not the arithmetic -- it is the failure mode. An
output whose percentage falls outside every tolerance window is SILENTLY
DROPPED:

    if (tier) rewards.push({ tier, address, amount: value });

No else. No warning. A dropped output simply never appears on the Live page,
and a missing reward row looks identical to a block that genuinely had none.
So the question this reference answers is not "is the formula right" but "how
often does that silent drop actually fire, and on what".

Percentages are derived from the shipped constants rather than hardcoded here,
so this keeps working across the subsidy reductions in issue #202 -- those
change the block SUBSIDY, not the tier SHARES, and this reference should
continue to agree afterwards. If it ever stops, that is itself the finding.
"""

import json
import pathlib
import re
import sys
import time
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[3]
APP_CONTENT = REPO / "client" / "public" / "runtime" / "app-content.js"
FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "latest"

EXPLORER = "https://explorer.runonflux.io/api"
HEADERS = {"User-Agent": "Mozilla/5.0 (FluxNode calculation audit)"}

DEV_FUND_ADDRESS = "t3hPu1YDeGUCp8m7BQCnnNUmRMJBa5RadyA"
TOLERANCE_PCT = 0.5
SAMPLE_BLOCKS = 12


def get(url, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode())
        except Exception:
            if attempt == tries - 1:
                return None
            time.sleep(3 * (attempt + 1))
    return None


def tier_percentages():
    text = APP_CONTENT.read_text(encoding="utf-8")
    out = {}
    for tier in ("CUMULUS", "NIMBUS", "STRATUS"):
        m = re.search(r"window\.gContent\.CC_FLUX_REWARD_%s\s*=\s*([0-9.]+)\s*;" % tier, text)
        if not m:
            raise SystemExit("CC_FLUX_REWARD_%s not found in app-content.js" % tier)
        out[tier] = float(m.group(1))
    return out


def classify(pct, tiers):
    """The app's rule, restated: first tier whose expected share is within
    tolerance. Returns None where the app would silently drop the output."""
    for tier, expected in tiers.items():
        if abs(pct - expected) <= TOLERANCE_PCT:
            return tier
    return None


def main():
    tiers = tier_percentages()

    tip = get("%s/blocks?limit=1" % EXPLORER)
    if not tip:
        raise SystemExit("could not reach the explorer")
    tip_height = tip["blocks"][0]["height"]

    examined = 0
    outputs_seen = 0
    classified = 0
    dev_fund = 0
    dropped = []

    for offset in range(SAMPLE_BLOCKS):
        height = tip_height - 2 - offset
        index = get("%s/block-index/%d" % (EXPLORER, height))
        if not index:
            continue
        page = get("%s/txs/?block=%s&pageNum=0" % (EXPLORER, index["blockHash"]))
        if not page:
            continue

        coinbase = next((t for t in page.get("txs", []) if t.get("isCoinBase")), None)
        if not coinbase:
            continue
        total_out = float(coinbase.get("valueOut") or 0)
        if not total_out:
            continue

        examined += 1
        for vout in coinbase.get("vout") or []:
            try:
                value = float(vout.get("value") or 0)
            except (TypeError, ValueError):
                continue
            addresses = (vout.get("scriptPubKey") or {}).get("addresses") or []
            if not value or not addresses:
                continue
            outputs_seen += 1
            address = addresses[0]
            if address == DEV_FUND_ADDRESS:
                dev_fund += 1
                classified += 1
                continue
            pct = (value / total_out) * 100.0
            tier = classify(pct, tiers)
            if tier:
                classified += 1
            else:
                dropped.append({
                    "height": height,
                    "address": address,
                    "value": value,
                    "pct_of_block": round(pct, 4),
                    "nearest": min(
                        ((t, round(abs(pct - e), 4)) for t, e in tiers.items()),
                        key=lambda x: x[1],
                    ),
                })
        time.sleep(0.5)

    result = {
        "tier_percentages": tiers,
        "tolerance_pct": TOLERANCE_PCT,
        "blocks_examined": examined,
        "coinbase_outputs_seen": outputs_seen,
        "classified": classified,
        "dev_fund_outputs": dev_fund,
        "silently_dropped": len(dropped),
        "dropped_detail": dropped[:20],
    }

    out = FIXTURES / "reference-d5.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print("reference D5 written to %s" % out)
    print("  tier shares from app-content.js: %s" % ", ".join("%s=%.3f%%" % (t, p) for t, p in tiers.items()))
    print("  blocks examined                  %d" % examined)
    print("  coinbase outputs seen            %d" % outputs_seen)
    print("  classified (incl. dev fund)      %d" % classified)
    print("  SILENTLY DROPPED                 %d" % len(dropped))
    if dropped:
        print()
        print("  outputs the Live page would omit entirely:")
        for d in dropped[:8]:
            print("    block %d  %.6f FLUX  %.4f%% of block  (nearest %s, off by %.4f pp)"
                  % (d["height"], d["value"], d["pct_of_block"], d["nearest"][0], d["nearest"][1]))
        print()
        print("  a dropped output is indistinguishable from a block that never")
        print("  had one -- there is no else branch and no warning.")
    else:
        print()
        print("  no drops across this sample: every coinbase output matched a")
        print("  tier share or the dev-fund address.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
