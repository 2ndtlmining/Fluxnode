import { categorizeApp } from 'main/Gamification/appCategories';

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
 * contributes one count per component, not one per app.
 */
export function aggregateDonorAppsByCategory(nodesByIp, donorAddresses) {
  const perCategory = {};
  let totalApps = 0;

  for (const addr of donorAddresses || []) {
    const node = nodesByIp?.[addr];
    if (!node) continue;

    for (const image of node.images || []) {
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
