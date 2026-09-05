import { hostOf, addressOf, fetch_node_benchmarks, fetch_node_resources } from 'networkNodes';

/*
 * Pure: sum the donor's own nodes' capacity and app-reserved utilisation,
 * joining the same shared benchmark/resource data buildWorkhorseNodes joins
 * for the Workhorse showcase (networkNodes.js:108-189) — filtered to the
 * donor's own addresses instead of ranked by app count.
 *
 * CAPACITY (cores/ram/ssd totals) is summed over the donor's UNIQUE HOSTS,
 * not per node address. A benchmark reading is per-machine, and a donor's
 * node list can include two nodes on one host (different ports) — summing
 * per address would double-count that host's capacity once per node
 * sharing it. Deduping to unique hosts before summing is what actually
 * prevents that (an earlier version of this function keyed the LOOKUP
 * table by host but still summed per address, which didn't fix anything —
 * the lookup was deduped, the summation wasn't).
 *
 * UTILISATION (appsCpusLocked/appsRamLocked/appsHddLocked) stays summed
 * PER ADDRESS — app reservations are genuinely per-node-instance, even
 * when two instances share one host's underlying hardware, matching
 * buildWorkhorseNodes exactly.
 */
export function aggregateDonorUtilization(donorAddresses, benchmarks, resources) {
  const benchByHost = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const host = hostOf(bench?.ipaddress);
    if (host) benchByHost[host] = bench;
  }

  const resByAddr = {};
  for (const entry of resources || []) {
    const addr = addressOf(entry?.ip);
    if (addr) resByAddr[addr] = entry?.apps?.resources || null;
  }

  // Capacity: one pass over the donor's UNIQUE hosts.
  const uniqueHosts = [...new Set((donorAddresses || []).map((a) => hostOf(addressOf(a))).filter(Boolean))];

  let totalCores = 0, totalRamGB = 0, totalSsdGB = 0;
  let hostsWithCapacity = 0;

  for (const host of uniqueHosts) {
    const bench = benchByHost[host];
    if (bench) {
      hostsWithCapacity++;
      totalCores += bench.cores || 0;
      totalRamGB += bench.ram || 0;
      totalSsdGB += bench.totalstorage ?? bench.ssd ?? 0;
    }
  }

  // Utilisation: one pass over the donor's own node ADDRESSES — genuinely
  // per-node, unlike capacity above.
  let utilizedCores = 0, utilizedRamGB = 0, utilizedSsdGB = 0;

  for (const rawAddr of donorAddresses || []) {
    const addr = addressOf(rawAddr);
    const res = resByAddr[addr];
    if (res) {
      utilizedCores += res.appsCpusLocked || 0;
      utilizedRamGB += res.appsRamLocked != null ? res.appsRamLocked / 1024 : 0;
      utilizedSsdGB += res.appsHddLocked || 0;
    }
  }

  const pct = (used, total) => (total > 0 ? (used / total) * 100 : 0);

  return {
    // Count of distinct HOSTS with a capacity reading, not a count of
    // node addresses — see the capacity/utilisation split above. Only
    // ever checked for === 0 by callers (an empty-state gate), never
    // displayed as a number, so this semantic (hosts, not nodes) is safe.
    nodesWithCapacity: hostsWithCapacity,
    cores: { utilized: utilizedCores, total: totalCores, percentage: pct(utilizedCores, totalCores) },
    ram: { utilized: utilizedRamGB, total: totalRamGB, percentage: pct(utilizedRamGB, totalRamGB) },
    ssd: { utilized: utilizedSsdGB, total: totalSsdGB, percentage: pct(utilizedSsdGB, totalSsdGB) },
  };
}

export async function fetch_donor_utilization(donorAddresses) {
  const [benchmarks, resources] = await Promise.all([fetch_node_benchmarks(), fetch_node_resources()]);
  return aggregateDonorUtilization(donorAddresses, benchmarks, resources);
}
