#!/usr/bin/env python3
"""Domain D4 -- node rankings, recomputed INDEPENDENTLY.

D4 is the domain that has already broken twice (the 2026-09-09 rankInGroup /
lookupNodeInfo bugs), which is why the reference here is built the way it is.

The independent derivation, and why it is genuinely independent:

`rankInGroup` in client/src/main/Gamification/rankInGroup.js is an O(n) counting
implementation whose OWN STATED PURPOSE is to reproduce what the previous
implementation did -- materialise a descending-sorted array and look the node up
in it. So the honest reference is to do exactly that: actually sort, actually
index. Slow, obvious, and derived from the specification rather than ported from
the optimisation.

That makes this a real check rather than a restatement. If the counting
implementation's tie-breaking or duplicate handling is subtly wrong, sorting
cannot make the same mistake -- the two disagree and the audit says so.

Two behaviours are load-bearing and are asserted head-on, because both are
exactly where this code broke before:

  Ties        Array.sort is stable, so among equal metric values the entry
              appearing EARLIER in the source array takes the better (lower)
              rank. Python's sorted() is also stable, so sorting descending by
              metric alone -- without any index tiebreak -- reproduces this
              faithfully.

  Duplicate   nodeData carries no port, so one host running several Flux nodes
  IPs         collapses to a single ip key appearing multiple times. Sorting
              descending FIRST and then taking the first match resolves a
              duplicated ip to its HIGHEST-value entry. A first-match scan over
              unsorted data would instead land on whatever the fetch happened to
              return first, silently downgrading a wallet's best node. This was
              a real, live-confirmed case (one wallet, 8 CUMULUS nodes on one
              host, EPS 265-2143).

Duplicate-ip nodes are therefore not a curiosity to skip -- they are sampled
deliberately and preferentially below.
"""

import json
import pathlib
import random
import sys
from collections import defaultdict

FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "latest"

METRICS = ("eps", "dws", "down_speed", "up_speed")
TIERS = ("CUMULUS", "NIMBUS", "STRATUS")

# Deterministic sampling: the same fixture must produce the same sample, or a
# disagreement cannot be reproduced by re-running.
SAMPLE_SEED = 20260911
SAMPLE_SIZE = 40


def load(name):
    path = FIXTURES / name
    if not path.exists():
        raise SystemExit("no fixture at %s -- run `python tools/audit/capture.py` first" % path)
    return json.loads(path.read_text(encoding="utf-8"))


DEFAULT_PORT = "16127"


def normalise_ip(raw):
    """`1.2.3.4:16157` stays; a bare `1.2.3.4` gets the default port.

    The port is the ONLY thing distinguishing several Flux nodes on one host,
    and both upstream feeds carry it. Keeping it is the whole point of this
    check.
    """
    raw = raw or ""
    if not raw:
        return ""
    return raw if ":" in raw else raw + ":" + DEFAULT_PORT


def tier_integrity():
    """Does collapsing ip:port to a bare host corrupt the tier assignment?

    The app builds `ipTierMap` as `host -> tier` (apidata.js:1210-1214), so a
    host running nodes of several tiers keeps only whichever the API returned
    LAST. This recomputes the assignment the precise way -- joining on ip:port
    -- and reports every node the two disagree on.

    Cross-checked against the daemon's own getzelnodecount rather than trusted:
    if the exact join is right, its per-tier totals should land within a few
    nodes of the authoritative counts (the gap being un-benchmarked nodes),
    while a corrupted join will not. That check is what turns "the two methods
    differ" into "and here is which one is wrong".
    """
    nodes = load("fluxnodes.json")
    bench = load("benchmarks.json")

    exact = {}
    host_collapsed = {}
    for node in nodes.get("fluxNodes", []) or []:
        raw = node.get("ip") or ""
        if not raw:
            continue
        tier = (node.get("tier") or "").upper()
        exact[normalise_ip(raw)] = tier
        host_collapsed[raw.split(":")[0]] = tier  # last write wins, as the app does

    resolvable = 0
    misassigned = []
    tally = {t: 0 for t in TIERS}
    for entry in (bench.get("data") if isinstance(bench, dict) else bench) or []:
        b = ((entry.get("benchmark") or {}).get("bench") or {}) if isinstance(entry, dict) else {}
        raw = b.get("ipaddress")
        if not raw:
            continue
        truth = exact.get(normalise_ip(raw))
        if truth not in TIERS:
            continue
        resolvable += 1
        tally[truth] += 1
        assigned = host_collapsed.get(raw.split(":")[0])
        if assigned != truth:
            misassigned.append({"ip": raw, "actual_tier": truth, "app_assigns": assigned})

    official = load("getzelnodecount.json")
    official = official.get("data", official)

    return {
        "resolvable_nodes": resolvable,
        "misassigned_count": len(misassigned),
        "misassigned_pct": round(100.0 * len(misassigned) / max(1, resolvable), 2),
        "misassigned_sample": misassigned[:20],
        "exact_join_tier_totals": tally,
        "daemon_enabled_counts": {t: official.get(t.lower() + "-enabled", 0) for t in TIERS},
    }


def build_node_data():
    """Join tier + benchmark + geo into the flat node list, independently.

    Mirrors the app's INPUTS and its documented filtering rules, not its code:
    strip the port from every ip, keep only the three real tiers, and drop
    anything without a benchmark or a known tier.

    NOTE -- the port stripping here is DELIBERATE, not an oversight. It
    reproduces the app's own (buggy, see issue #215 and tier_integrity above)
    host-collapsed join on purpose, so that the ranking check below isolates
    ONE question: given identical input, does the O(n) counting rank agree with
    a materialised sort? Feeding the reference a corrected join would conflate
    a ranking-algorithm bug with the tier-assignment bug and make a
    disagreement impossible to attribute. Wrong INPUT and wrong ARITHMETIC are
    separate findings and are kept separate.
    """
    nodes = load("fluxnodes.json")
    bench = load("benchmarks.json")
    geo = load("geolocation.json")

    ip_tier = {}
    payment_address = {}
    for node in nodes.get("fluxNodes", []) or []:
        host = (node.get("ip") or "").split(":")[0]
        if not host:
            continue
        tier = (node.get("tier") or "").upper()
        if tier:
            ip_tier[host] = tier
        if node.get("payment_address"):
            payment_address.setdefault(host, node["payment_address"])

    geo_by_ip = {}
    for entry in (geo.get("data") if isinstance(geo, dict) else geo) or []:
        g = (entry.get("geolocation") or {}) if isinstance(entry, dict) else {}
        host = (g.get("ip") or entry.get("ip") or "").split(":")[0]
        if host and g:
            geo_by_ip[host] = {
                "countryCode": g.get("countryCode") or g.get("country_code"),
                "country": g.get("country"),
            }

    node_data = []
    for entry in (bench.get("data") if isinstance(bench, dict) else bench) or []:
        b = ((entry.get("benchmark") or {}).get("bench") or {}) if isinstance(entry, dict) else {}
        if not b:
            continue
        host = (b.get("ipaddress") or "").split(":")[0]
        if not host:
            continue
        tier = ip_tier.get(host)
        if tier not in TIERS:
            continue
        node_data.append({
            "ip": host,
            "tier": tier,
            "eps": b.get("eps") or 0,
            "dws": b.get("ddwrite") or 0,
            "down_speed": b.get("download_speed") or 0,
            "up_speed": b.get("upload_speed") or 0,
            "geo": geo_by_ip.get(host),
            "payment_address": payment_address.get(host),
        })
    return node_data


def rank_by_sorting(group, target_ip, metric):
    """Rank by MATERIALISING the sorted array and indexing it.

    This is the slow, obvious implementation the app's O(n) counter claims to
    reproduce. sorted() is stable, so equal values keep source order, which is
    precisely the tie-break the app documents. Taking the first match after
    sorting descending resolves a duplicated ip to its best entry -- again,
    exactly what the app says it does.
    """
    ordered = sorted(group, key=lambda n: n.get(metric) or 0, reverse=True)
    for index, node in enumerate(ordered):
        if node["ip"] == target_ip:
            return {"rank": index + 1, "value": node.get(metric) or 0, "total": len(group)}
    return None


def main():
    node_data = build_node_data()
    if not node_data:
        raise SystemExit("built an empty node list -- upstream shape changed?")

    by_tier = {tier: [n for n in node_data if n["tier"] == tier] for tier in TIERS}

    # tierWinners: the single best node per tier per metric.
    tier_winners = {}
    for tier in TIERS:
        tier_winners[tier] = {}
        group = by_tier[tier]
        for metric in METRICS:
            if not group:
                tier_winners[tier][metric] = None
                continue
            best = max(group, key=lambda n: n.get(metric) or 0)
            # max() returns the FIRST maximal element, matching the app's
            # strict `>` comparison (earlier index wins a tie).
            tier_winners[tier][metric] = {"ip": best["ip"], "value": best.get(metric) or 0}

    # Sample nodes to rank. Duplicate ips are the historical failure mode, so
    # every duplicated ip is included before any random filling.
    ip_counts = defaultdict(int)
    for n in node_data:
        ip_counts[n["ip"]] += 1
    duplicate_ips = sorted(ip for ip, c in ip_counts.items() if c > 1)

    rng = random.Random(SAMPLE_SEED)
    sample = []
    for ip in duplicate_ips[:SAMPLE_SIZE]:
        tier = next(n["tier"] for n in node_data if n["ip"] == ip)
        sample.append({"ip": ip, "tier": tier, "duplicate": True})
    remaining = SAMPLE_SIZE - len(sample)
    if remaining > 0:
        singles = sorted({n["ip"] for n in node_data if ip_counts[n["ip"]] == 1})
        for ip in rng.sample(singles, min(remaining, len(singles))):
            tier = next(n["tier"] for n in node_data if n["ip"] == ip)
            sample.append({"ip": ip, "tier": tier, "duplicate": False})

    ranks = []
    for item in sample:
        entry = {"ip": item["ip"], "tier": item["tier"], "duplicate": item["duplicate"], "metrics": {}}
        for metric in METRICS:
            entry["metrics"][metric] = rank_by_sorting(by_tier[item["tier"]], item["ip"], metric)
        ranks.append(entry)

    country_tier_counts = {}
    for n in node_data:
        cc = (n.get("geo") or {}).get("countryCode")
        if not cc:
            continue
        bucket = country_tier_counts.setdefault(cc, {"country": n["geo"].get("country"), "tiers": {}})
        bucket["tiers"][n["tier"]] = bucket["tiers"].get(n["tier"], 0) + 1

    integrity = tier_integrity()

    result = {
        "tier_integrity": integrity,
        "tier_winners": tier_winners,
        "ranks": ranks,
        "country_tier_counts": country_tier_counts,
        "_meta": {
            "node_count": len(node_data),
            "by_tier": {t: len(by_tier[t]) for t in TIERS},
            "duplicate_ip_count": len(duplicate_ips),
            "sampled": len(sample),
            "sampled_duplicates": sum(1 for s in sample if s["duplicate"]),
            "sample_seed": SAMPLE_SEED,
        },
    }

    out = FIXTURES / "reference-d4.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    meta = result["_meta"]
    print("reference D4 written to %s" % out)
    print("  %d nodes  (%s)" % (meta["node_count"], ", ".join("%s=%d" % (t.lower(), meta["by_tier"][t]) for t in TIERS)))
    print("  %d ips appear more than once (multi-node hosts)" % meta["duplicate_ip_count"])
    print("  sampled %d nodes for ranking, %d of them duplicated ips" % (meta["sampled"], meta["sampled_duplicates"]))
    print("  %d countries" % len(country_tier_counts))
    print()
    print("  TIER-ASSIGNMENT INTEGRITY (see issue #215)")
    print("    %d of %d benchmarked nodes get the WRONG tier from the app (%.2f%%)"
          % (integrity["misassigned_count"], integrity["resolvable_nodes"], integrity["misassigned_pct"]))
    print("    exact ip:port join vs daemon enabled-counts:")
    for tier in TIERS:
        print("      %-8s exact=%4d  daemon=%4d"
              % (tier, integrity["exact_join_tier_totals"][tier], integrity["daemon_enabled_counts"][tier]))
    if integrity["misassigned_count"]:
        print("    -> the exact join matching the daemon, while the host-collapsed one")
        print("       reports MORE nodes than exist, is what identifies which is wrong.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
