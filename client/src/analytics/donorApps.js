import { categorizeApp } from 'main/Gamification/appCategories';
import { addressOf } from 'networkNodes';

/*
 * Pure: tally the donor's own running apps by category, from the IP-keyed
 * lookup Task 1 added to fluxinfo.js's fetch_fluxinfo_aggregate() output
 * (nodesByIp — added specifically so a wallet's own, typically-not-top-5
 * nodes are visible here at all; the pre-existing topNodesByApps only ever
 * covers the network's 5 busiest nodes).
 *
 * Categorizes by DOCKER IMAGE (repotag), not app name — this codebase's
 * established preference (main/Gamification/appCategories.js's own header
 * comment, and categorizeAppSpec's identical choice): the repotag is right
 * far more often than the user-chosen name.
 *
 * Tallies one entry per running CONTAINER, matching the network-wide App
 * Ecosystem panel's own convention — a multi-component compose app
 * contributes one count per component, not one per app. containrrr/watchtower
 * is excluded from that tally: every Flux node runs it to auto-update its
 * own containers, so it's infrastructure the node runs for itself, not
 * something the donor deployed — apidata.js's own totalRunningApps figure
 * (apidata.js:505) already excludes it network-wide for the same reason.
 *
 * Addresses are normalized via addressOf() before lookup, matching
 * donorUtilization.js's own normalization — a whitespace/format mismatch
 * here would otherwise silently render "no apps" indistinguishable from a
 * real empty result.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses) {
  const perCategory = {};
  let totalApps = 0;

  for (const rawAddr of donorAddresses || []) {
    const node = nodesByIp?.[addressOf(rawAddr)];
    if (!node) continue;

    for (const image of node.images || []) {
      if (image.toLowerCase().includes('containrrr/watchtower')) continue;

      const cat = categorizeApp(image);
      perCategory[cat] = (perCategory[cat] || 0) + 1;
      totalApps++;
    }
  }

  const categories = Object.entries(perCategory)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return { categories, totalApps };
}
