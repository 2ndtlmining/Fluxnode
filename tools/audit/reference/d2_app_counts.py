#!/usr/bin/env python3
"""Domain D2 -- running-app counts, recomputed INDEPENDENTLY.

D2 has one rule that matters more than any arithmetic in it, decided
2026-08-26 and recorded in the project memory:

    stats.runonflux.io/fluxinfo is the CANONICAL source for running apps.
    api.runonflux.io/apps/globalappsspecifications counts what was ORDERED,
    not what is running, so it always reads higher. It must NEVER be used as
    a silent fallback -- when fluxinfo is down the fix is retry, last-known-
    good, and a visible stale marker, never a dataset swap.

A silent swap would not crash anything. It would just inflate every running-app
figure on the site, which is exactly the kind of wrong-but-plausible number this
audit exists to catch. So this reference does two things:

  1. Recounts running instances from raw container names, independently.
  2. Asserts the ordered count genuinely exceeds the running count -- the
     invariant that makes a swap detectable at all. If those two ever converge,
     the distinction the rule protects has quietly stopped being observable.

The parsing rule is derived from the documented Flux naming convention rather
than ported:

    flux<component>_<appname>   compose app   -> name after the FIRST underscore
    flux<appname>               single        -> the whole body

Splitting on the FIRST underscore is load-bearing: component names never
contain one, app names may. Splitting on the last would corrupt every app whose
own name contains an underscore.
"""

import json
import pathlib
import sys
from collections import Counter

FIXTURES = pathlib.Path(__file__).resolve().parents[1] / "fixtures" / "latest"


def load(name):
    path = FIXTURES / name
    if not path.exists():
        raise SystemExit("no fixture at %s -- run `python tools/audit/capture.py` first" % path)
    return json.loads(path.read_text(encoding="utf-8"))


def app_name_from_container(container_name):
    """`/fluxFoldingAtHome_FoldingAtRunOnFlux29` -> `FoldingAtRunOnFlux29`."""
    raw = (container_name or "").lstrip("/")
    if not raw.startswith("flux"):
        return None
    body = raw[4:]
    underscore = body.find("_")
    name = body if underscore == -1 else body[underscore + 1:]
    return name or None


def count_running():
    """Every running container across every node, tallied by app name."""
    payload = load("fluxinfo.json")
    entries = payload.get("data", payload)

    instances = Counter()
    total_containers = 0
    unparseable = 0
    nodes_with_apps = 0

    for entry in entries:
        running = ((entry or {}).get("apps") or {}).get("runningapps") or []
        if running:
            nodes_with_apps += 1
        for container in running:
            names = container.get("Names") or []
            if not names:
                unparseable += 1
                continue
            total_containers += 1
            name = app_name_from_container(names[0])
            if name is None:
                # A container that does not follow the flux naming convention
                # is counted separately rather than silently dropped -- a
                # sudden rise here would mean the convention changed.
                unparseable += 1
                continue
            instances[name] += 1

    return {
        "total_nodes": len(entries),
        "nodes_with_running_apps": nodes_with_apps,
        "total_running_instances": total_containers,
        "distinct_running_apps": len(instances),
        "unparseable_containers": unparseable,
        "top_apps": instances.most_common(15),
        "_instances": instances,
    }


def count_ordered():
    """Ordered app specs -- the number that must NOT be used as a running count."""
    payload = load("globalappsspecifications.json")
    specs = payload.get("data", payload) or []

    # An ordered spec's instance count is its `instances` field; older specs
    # omit it and mean 1.
    ordered_instances = 0
    for spec in specs:
        if not isinstance(spec, dict):
            continue
        ordered_instances += int(spec.get("instances") or 1)

    return {
        "distinct_ordered_apps": len(specs),
        "ordered_instances": ordered_instances,
    }


def main():
    running = count_running()
    ordered = count_ordered()
    instances = running.pop("_instances")

    running_total = running["total_running_instances"]
    ordered_total = ordered["ordered_instances"]

    # The invariant. Ordered should meaningfully exceed running: an ordered app
    # may be unplaced, mid-deployment, or expired-but-unreaped.
    invariant_holds = ordered_total > running_total
    ratio = (ordered_total / running_total) if running_total else 0.0

    result = {
        "running": running,
        "ordered": ordered,
        "canonical_source_invariant": {
            "rule": "globalappsspecifications (ordered) must exceed fluxinfo (running); it must never be substituted for it",
            "ordered_instances": ordered_total,
            "running_instances": running_total,
            "ordered_exceeds_running": invariant_holds,
            "ordered_to_running_ratio": round(ratio, 4),
        },
    }

    out = FIXTURES / "reference-d2.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print("reference D2 written to %s" % out)
    print("  nodes reporting              %d (of %d)" % (running["nodes_with_running_apps"], running["total_nodes"]))
    print("  RUNNING instances            %d across %d distinct apps"
          % (running_total, running["distinct_running_apps"]))
    print("  ORDERED instances            %d across %d distinct specs"
          % (ordered_total, ordered["distinct_ordered_apps"]))
    print("  unparseable container names  %d" % running["unparseable_containers"])
    print()
    if invariant_holds:
        print("  invariant HOLDS: ordered exceeds running by %.2fx" % ratio)
        print("    -> the two sources remain distinguishable, so a silent swap")
        print("       would be detectable rather than merely plausible.")
    else:
        print("  invariant VIOLATED: ordered (%d) does NOT exceed running (%d)." % (ordered_total, running_total))
        print("    -> either a source is being substituted, or the two have")
        print("       converged and the canonical-source rule can no longer be")
        print("       verified by counting alone. Investigate before trusting")
        print("       any running-app figure on the site.")
    print()
    print("  top running apps by instance count:")
    for name, count in running["top_apps"][:8]:
        print("    %-42s %5d" % (name[:42], count))
    return 0 if invariant_holds else 1


if __name__ == "__main__":
    sys.exit(main())
