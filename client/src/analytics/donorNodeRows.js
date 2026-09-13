import { addressOf } from 'networkNodes';
import { calc_mtn_window } from 'apidata';

/*
 * The donor's own nodes, with the two figures issue #301 asks for beside rank:
 * the maintenance window and the benchmark reading.
 *
 * Neither costs a fetch. transformRawNode already keeps last_confirmed_height,
 * which is all calc_mtn_window needs given the chain tip the tab already holds
 * for the reward countdown; and the benchmark feed is the same shared one the
 * utilisation panel aggregates, so it is in memory by the time this runs.
 *
 * EPS is matched by ADDRESS (ip:port). It used to be matched by HOST, on the
 * premise that a benchmark measures the MACHINE and co-hosted nodes therefore
 * share one reading. Issue #344: measured against the live feed, that is false.
 *
 *     816 multi-node hosts carry an EPS reading
 *       1 has every node reporting the same value
 *     815 have nodes reporting DIFFERENT values
 *
 *     5.230.172.45  348 | 572 | 1408 | 2071 | 329 | 329 | 762 | 1406
 *
 * A 6x spread on one physical box. EPS is a score a node earns for its own
 * allocation at its own moment, not a property of the hardware beneath it.
 * Host-keying kept whichever node was written last and repeated that score
 * across every node on the address -- wrong for seven of those eight, and
 * invisibly so, since a plausible number appeared in every row.
 *
 * donorUtilization.js made the identical mistake for capacity and was fixed in
 * the same issue. Geolocation remains the one thing that genuinely IS per-host
 * -- see addressOf's own doc comment in networkNodes.js.
 */
export function buildDonorNodeRows(nodes, benchmarks, currentBlockHeight) {
  const epsByAddress = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const address = addressOf(bench?.ipaddress);
    if (address && bench?.eps != null) epsByAddress[address] = bench.eps;
  }

  return (nodes || []).map((node) => {
    const address = addressOf(node.ip_display);
    const eps = address ? epsByAddress[address] : undefined;

    return {
      ...node,
      /*
       * null rather than a computed string when the tip is unknown: the window
       * is `480 - (tip - last_confirmed)`, so a missing tip does not make the
       * window long, it makes it unknowable. Rendering "Closed" or a duration
       * off a zero tip would be a confident wrong answer.
       */
      mtnWindow: currentBlockHeight ? calc_mtn_window(node.last_confirmed_height, currentBlockHeight) : null,
      // Likewise null, never 0 -- a node with no benchmark reading has not
      // scored zero, it has not reported.
      eps: eps == null ? null : eps,
    };
  });
}
