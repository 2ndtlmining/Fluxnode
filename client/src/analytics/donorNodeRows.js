import { hostOf, addressOf } from 'networkNodes';
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
 * EPS is matched by HOST, not by address. A benchmark is a measurement of a
 * MACHINE -- when a donor runs two nodes on one box (different ports) both
 * genuinely have the same reading, and keying by address would leave the second
 * one blank. This is the same host/address distinction donorUtilization.js
 * makes for capacity, for the same reason.
 */
export function buildDonorNodeRows(nodes, benchmarks, currentBlockHeight) {
  const epsByHost = {};
  for (const entry of benchmarks || []) {
    const bench = entry?.benchmark?.bench;
    const host = hostOf(bench?.ipaddress);
    if (host && bench?.eps != null) epsByHost[host] = bench.eps;
  }

  return (nodes || []).map((node) => {
    const host = hostOf(addressOf(node.ip_display));
    const eps = host != null ? epsByHost[host] : undefined;

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
