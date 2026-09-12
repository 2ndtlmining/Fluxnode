/*
 * Does this wallet host FluxNode itself? (issue #245)
 *
 * Matched on REPOTAG rather than app name. The name is whatever the operator
 * chose to call their deployment; the repotag is the image's stable identity.
 * Somebody running 2ndtlmining/flux under their own name is still running
 * FluxNode, and an unrelated app that happens to be CALLED "fluxnode" is not.
 *
 * The match is deliberately exact on the repository, not a substring of the
 * whole repotag. `runonflux/*` covers a large share of the network and
 * `someoneelse/fluxnode` is a different image entirely -- a loose match would
 * hand a platinum achievement to almost everybody and make it worthless.
 *
 * Rarity at the time of writing: 4 nodes, 4 distinct wallets, out of 837
 * wallets on the network.
 */

export const FLUXNODE_APP_REPO = '2ndtlmining/flux';

/** The repository part of a repotag, with any `:tag` and case dropped. */
function repoOf(repotag) {
  return String(repotag || '')
    .split(':')[0]
    .toLowerCase();
}

function specRunsFluxnode(spec) {
  if (!spec) return false;
  if (repoOf(spec.repotag) === FLUXNODE_APP_REPO) return true;

  // A compose app's components each have their own image; FluxNode may be any
  // one of them rather than the spec's primary repotag.
  return (Array.isArray(spec.compose) ? spec.compose : []).some(
    (component) => repoOf(component?.repotag) === FLUXNODE_APP_REPO
  );
}

export function hostsFluxnodeApp(walletNodes) {
  if (!Array.isArray(walletNodes)) return false;

  return walletNodes.some((node) =>
    (Array.isArray(node?.installedApps) ? node.installedApps : []).some(specRunsFluxnode)
  );
}
