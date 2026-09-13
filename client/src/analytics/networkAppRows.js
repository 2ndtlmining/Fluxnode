import { repotagForComponent } from 'appSpecs';
import { isOpaqueRuntimeImage } from 'main/Gamification/appCategories';

/*
 * The hosted applications behind a region's category counts (issue #351).
 *
 * The Network tab could say a country runs four Gaming apps and stop there.
 * This is the list behind that number, scoped to whatever continent or country
 * is selected, so clicking a category answers "which ones, and where?".
 *
 * Costs no fetch. The tab already has the node list, the running-apps map and
 * the spec index in hand for the cards above -- this is a third reading of the
 * same bytes.
 *
 * ONE ROW PER INSTANCE, not per container. That is the unit #344 settled on
 * across the Donor apps table, regionStats and the app ecosystem panel: a
 * multi-component app is one deployment on one node however many containers it
 * takes. WordPress is nginx + mysql and is one row here. A fourth surface
 * disagreeing would undo the point of that issue.
 */

const BLOCKS_PER_DAY = 2880;

/**
 * When an app's paid term runs out.
 *
 * `expire` IS A DURATION IN BLOCKS, not a timestamp and not an absolute
 * height. A spec at height 2,900,000 with expire 19506 runs out at 2,919,506;
 * 19506 / 2880 is 6.8 days, the standard weekly deployment. Reading it as an
 * absolute height would put every expiry in 1970's block numbering.
 *
 * Returns null rather than a guess when the spec cannot say -- an app with no
 * matching spec has no term to report, and a tip of 0 means we do not know
 * where the chain is.
 */
export function expiryFromHeight(spec, tipHeight) {
  const height = spec?.height || 0;
  const expire = spec?.expire || 0;
  if (!height || !expire || !tipHeight) return null;

  const expiryHeight = height + expire;
  const blocksLeft = expiryHeight - tipHeight;

  return {
    expiryHeight,
    blocksLeft,
    daysLeft: blocksLeft / BLOCKS_PER_DAY,
    /*
     * NOT clamped at zero. An app past its term would otherwise render as
     * "expires today", which reads as healthy -- and fluxinfo keeps reporting
     * one as running for a while after it lapses, so this is a state the list
     * genuinely shows.
     */
    expired: blocksLeft < 0,
  };
}

/**
 * @param nodes      the region's nodes, already scoped by the caller
 * @param appsByNode the WHOLE network's running apps, keyed ip:port
 * @param specIndex  buildSpecIndex output
 * @param tipHeight  current chain height, for expiry
 */
export function buildNetworkAppRows({ nodes, appsByNode, specIndex, tipHeight } = {}) {
  if (!Array.isArray(nodes) || !appsByNode) return [];
  const index = specIndex || {};
  const rows = [];

  for (const node of nodes) {
    const nodeAddress = node?.ip;
    if (!nodeAddress) continue;

    // Distinct names: the containers of one multi-component app collapse to
    // the single instance they are.
    for (const name of new Set(appsByNode[nodeAddress] || [])) {
      const spec = index[name];

      /*
       * Every Flux node runs watchtower to auto-update its own containers. It
       * is infrastructure the node runs for itself, not something anybody
       * deployed, and it is excluded from every other app tally on the site.
       */
      const repotag = spec ? repotagForComponent(spec, null) : '';
      if (repotag.toLowerCase().includes('containrrr/watchtower')) continue;

      rows.push({
        key: `${nodeAddress}|${name}`,
        nodeAddress,
        name,
        repotag,
        /*
         * runonflux/orbit is Flux's git-deployment wrapper: the workload inside
         * is opaque, so categorising by the operator's arbitrary deployment
         * name misleads. Same treatment the tab's own categoryOf gives it, so
         * this list and the card above it agree on what a category means.
         */
        category: isOpaqueRuntimeImage(spec?.repotag) ? 'other' : spec?.category || 'other',
        /*
         * null, never 0. specResources returns nulls for enterprise apps --
         * their compose is encrypted, so there is nothing to sum -- and "0.00
         * cores" would be a confident claim that the app uses nothing. An app
         * with no spec at all is treated the same way: real enough to list,
         * nothing knowable about its size.
         */
        cpu: spec ? spec.cpuPerInst : null,
        ramGB: spec ? spec.ramGBPerInst : null,
        ssdGB: spec ? spec.ssdGBPerInst : null,
        expiresAt: expiryFromHeight(spec, tipHeight),
      });
    }
  }

  return rows;
}

/** The whole list when nothing is selected; otherwise only that category. */
export function filterByCategory(rows, category) {
  if (!Array.isArray(rows)) return [];
  if (!category) return rows;
  return rows.filter((r) => r.category === category);
}
