import { hostOf, addressOf, fetch_node_benchmarks, fetch_node_resources } from 'networkNodes';

/*
 * Pure: sum the donor's own nodes' capacity and app-reserved utilisation,
 * joining the same shared benchmark/resource data buildWorkhorseNodes joins
 * for the Workhorse showcase (networkNodes.js:108-189) — filtered to the
 * donor's own addresses instead of ranked by app count.
 *
 * Benchmarks are keyed by HOST (hostOf), not full address: a benchmark
 * reading is per-machine, and a donor's node list can include two nodes on
 * one host (the exact scenario networkNodes.js's own header comment
 * documents addressOf existing for) — keying by full address here would
 * double-count that host's capacity if the donor runs multiple nodes on it.
 * Resources ARE keyed by full address (addressOf) — app reservations are
 * genuinely per-node, matching buildWorkhorseNodes exactly.
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

  let totalCores = 0, utilizedCores = 0;
  let totalRamGB = 0, utilizedRamGB = 0;
  let totalSsdGB = 0, utilizedSsdGB = 0;
  let nodesWithCapacity = 0;

  for (const rawAddr of donorAddresses || []) {
    const addr = addressOf(rawAddr);
    const bench = benchByHost[hostOf(addr)];
    const res = resByAddr[addr];

    if (bench) {
      nodesWithCapacity++;
      totalCores += bench.cores || 0;
      totalRamGB += bench.ram || 0;
      totalSsdGB += bench.totalstorage ?? bench.ssd ?? 0;
    }
    if (res) {
      utilizedCores += res.appsCpusLocked || 0;
      utilizedRamGB += res.appsRamLocked != null ? res.appsRamLocked / 1024 : 0;
      utilizedSsdGB += res.appsHddLocked || 0;
    }
  }

  const pct = (used, total) => (total > 0 ? (used / total) * 100 : 0);

  return {
    nodesWithCapacity,
    cores: { utilized: utilizedCores, total: totalCores, percentage: pct(utilizedCores, totalCores) },
    ram: { utilized: utilizedRamGB, total: totalRamGB, percentage: pct(utilizedRamGB, totalRamGB) },
    ssd: { utilized: utilizedSsdGB, total: totalSsdGB, percentage: pct(utilizedSsdGB, totalSsdGB) },
  };
}

export async function fetch_donor_utilization(donorAddresses) {
  const [benchmarks, resources] = await Promise.all([fetch_node_benchmarks(), fetch_node_resources()]);
  return aggregateDonorUtilization(donorAddresses, benchmarks, resources);
}
