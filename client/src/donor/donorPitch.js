import { DONOR_THRESHOLD_FLUX } from 'donor/config';

/*
 * Copy and figures for the Home page's donor panel (issue #242).
 *
 * Pure and data-only -- it takes the store Home already has and returns
 * strings. No fetching: every number here comes from data the page has
 * loaded anyway, so the panel costs nothing to render and cannot be the
 * reason Home is slow.
 *
 * The point of the teasers is to show the SIZE of what sits behind the
 * gate without showing the thing itself. "6,366 nodes across 54 countries"
 * is a reason to want the map; it is not the map.
 */

const fmt = (n) => Math.round(n).toLocaleString('en-US');

/*
 * The donor threshold in FLUX, with a dollar figure at the CURRENT price
 * rather than a hardcoded one -- the user's explicit ask, and the only
 * honest way to state it when FLUX moves.
 *
 * Falls back to the bare FLUX figure when the price has not loaded or is
 * nonsense. A cost line reading "10 FLUX ~ $0.00" is worse than one that
 * simply doesn't mention dollars.
 */
export function formatDonorCost(fluxPriceUsd) {
  const price = Number(fluxPriceUsd);
  if (!Number.isFinite(price) || price <= 0) return `${DONOR_THRESHOLD_FLUX} FLUX`;
  return `${DONOR_THRESHOLD_FLUX} FLUX \u2248 $${(DONOR_THRESHOLD_FLUX * price).toFixed(2)}`;
}

// Exported so the panel's layout can be reasoned about without calling the
// builder, and so a test can assert the set never silently changes shape.
export const DONOR_HIGHLIGHT_KEYS = ['worldMap', 'appEcosystem', 'chainActivity', 'nodeDetail', 'live'];

export function donorHighlights({ gstore, countryCounts } = {}) {
  const store = gstore || {};
  const totalNodes = Number(store.node_count?.total) || 0;
  const countries = countryCounts ? Object.keys(countryCounts).length : 0;

  const categories = store.runningCategoryMap;
  const instances = categories
    ? Object.values(categories).reduce((sum, n) => sum + (Number(n) || 0), 0)
    : 0;

  return [
    {
      key: 'worldMap',
      title: 'World map & continent breakdown',
      teaser:
        totalNodes > 0 && countries > 0
          ? `${fmt(totalNodes)} nodes across ${fmt(countries)} countries`
          : 'Every node placed on the map, by country and continent',
    },
    {
      key: 'appEcosystem',
      title: 'App ecosystem & top hosted apps',
      teaser:
        instances > 0
          ? `${fmt(instances)} app instances running right now`
          : 'What the network is actually running, by category',
    },
    {
      key: 'chainActivity',
      title: 'Chain activity & your 7-day ledger',
      teaser: 'Node rewards, exchange moves and transfers, split apart',
    },
    {
      key: 'nodeDetail',
      title: 'Achievements & per-node apps',
      teaser: 'For every node in your wallet, on the nodes page',
    },
    {
      key: 'live',
      title: 'Live chain view',
      teaser: 'Blocks and payouts as they land',
    },
  ];
}
