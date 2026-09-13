/*
 * Apps tab headline figures that describe what is RUNNING (issue #339).
 *
 * The tab used to lead with "Ordered app instances", summed from
 * globalappsspecifications. That is what people asked the network for, not
 * what it is doing -- and it sat directly above APP ECOSYSTEM's running
 * container total, two large numbers in different units where the ordered one
 * was the SMALLER. (One ordered instance of a four-component app is four
 * running containers, and at least one app runs far above its spec.)
 *
 * Owner-based figures on this tab stay spec-derived and that is not a
 * contradiction: running data carries no owner. fluxinfo reports container
 * names and nothing else, so "who owns this" has exactly one source.
 */

/**
 * Nodes currently running at least one app.
 *
 * fluxinfo's per-node records only exist for nodes with running containers
 * (see fluxinfo.js, where perNode is pushed only when running.length > 0), so
 * the size of that map IS the count -- no filtering needed, and no risk of
 * counting a node that reported in with nothing on it.
 */
export function nodesRunningApps(gstore) {
  const byIp = gstore?.nodesByIp;
  if (!byIp || typeof byIp !== 'object') return 0;
  return Object.keys(byIp).length;
}
