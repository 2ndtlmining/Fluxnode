import { addressOf, fetch_node_benchmarks, fetch_node_resources } from 'networkNodes';

/*
 * Pure: sum the donor's own nodes' capacity and app-reserved utilisation,
 * joining the same shared benchmark/resource data buildWorkhorseNodes joins
 * for the Workhorse showcase (networkNodes.js:108-189) — filtered to the
 * donor's own addresses instead of ranked by app count.
 *
 * BOTH HALVES ARE SUMMED PER NODE ADDRESS (ip:port), never per host.
 *
 * An earlier version summed capacity over unique HOSTS, on the premise that a
 * benchmark reading describes the physical machine and would otherwise be
 * double-counted once per node sharing it. Issue #344: that premise is wrong.
 * A benchmark describes ONE NODE'S OWN ALLOCATION. Measured on the live feed:
 *
 *     5.230.172.45    8 nodes, each 4 cores / 7.7 GB / 220 GB
 *     31.165.225.118  4c, 4c, 4c, 8c, 16c  -- Cumulus x3, Nimbus, Stratus
 *
 * Those are precisely the Flux tier allocations (Cumulus 4c/8GB/220GB, Nimbus
 * 8c/32GB/440GB, Stratus 16c/64GB/880GB). A host running eight Cumulus nodes
 * genuinely has 32 cores and each node truthfully reports its own 4.
 *
 * Host-deduping therefore kept whichever node was written last and discarded
 * the others: 4 cores where the donor has 32. Across the whole feed -- 6,315
 * nodes on 2,445 hosts, 816 multi-node -- a 44% undercount network-wide, 8x
 * for a donor whose nodes share a host, and a utilisation percentage that could
 * exceed 100% because the numerator was per-node while the denominator was not.
 *
 * The lookups stay keyed by ADDRESS, so a repeated entry in either feed, or a
 * repeated donor address, still contributes once.
 */
export function aggregateDonorUtilization(donorAddresses, benchmarks, resources) {
  const benchByAddr = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const addr = addressOf(bench?.ipaddress);
    if (addr) benchByAddr[addr] = bench;
  }

  const resByAddr = {};
  for (const entry of resources || []) {
    const addr = addressOf(entry?.ip);
    if (addr) resByAddr[addr] = entry?.apps?.resources || null;
  }

  // One pass over the donor's own node addresses, deduped — the same unit for
  // capacity and utilisation, which is the whole point of #344.
  const uniqueAddresses = [...new Set((donorAddresses || []).map((a) => addressOf(a)).filter(Boolean))];

  let totalCores = 0, totalRamGB = 0, totalSsdGB = 0;
  let nodesWithCapacity = 0;
  let utilizedCores = 0, utilizedRamGB = 0, utilizedSsdGB = 0;

  for (const addr of uniqueAddresses) {
    const bench = benchByAddr[addr];
    if (bench) {
      nodesWithCapacity++;
      totalCores += bench.cores || 0;
      totalRamGB += bench.ram || 0;
      totalSsdGB += bench.totalstorage ?? bench.ssd ?? 0;
    }

    const res = resByAddr[addr];
    if (res) {
      utilizedCores += res.appsCpusLocked || 0;
      utilizedRamGB += res.appsRamLocked != null ? res.appsRamLocked / 1024 : 0;
      utilizedSsdGB += res.appsHddLocked || 0;
    }
  }

  const pct = (used, total) => (total > 0 ? (used / total) * 100 : 0);

  return {
    // Distinct node ADDRESSES with a capacity reading. It now means what its
    // name always said — before #344 it counted hosts, which is why a donor
    // with eight nodes on one machine was described as having one.
    nodesWithCapacity,
    cores: { utilized: utilizedCores, total: totalCores, percentage: pct(utilizedCores, totalCores) },
    ram: { utilized: utilizedRamGB, total: totalRamGB, percentage: pct(utilizedRamGB, totalRamGB) },
    ssd: { utilized: utilizedSsdGB, total: totalSsdGB, percentage: pct(utilizedSsdGB, totalSsdGB) },
  };
}

/*
 * The raw feeds behind the aggregation above.
 *
 * The Donor tab re-aggregates when a node is selected (issue #299), so it needs
 * the inputs rather than one pre-summed answer — filtering the RESULT is not
 * possible, since a percentage of a subset cannot be recovered from a
 * percentage of the whole. Both fetches are the module-level shared ones, so
 * asking for the source costs nothing on top of fetch_donor_utilization.
 */
export async function fetch_donor_utilization_source() {
  const [benchmarks, resources] = await Promise.all([fetch_node_benchmarks(), fetch_node_resources()]);
  return { benchmarks, resources };
}

export async function fetch_donor_utilization(donorAddresses) {
  const { benchmarks, resources } = await fetch_donor_utilization_source();
  return aggregateDonorUtilization(donorAddresses, benchmarks, resources);
}
