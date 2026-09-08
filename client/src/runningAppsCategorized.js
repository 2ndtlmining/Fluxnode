import { buildCategoryTop } from 'fluxinfo';

// Recognised via specIndex only now (issue #187 removed the docker image
// fluxinfo used to report, so these can no longer be image-substring
// matches — they're resolved by joining the running app's NAME to its
// globalappsspecifications repotag, same source AppsSection/WorkhorsePanel
// already trust for this).
const WORDPRESS_REPO_BASE = 'runonflux/wp-nginx';
const STREAMR_REPO_BASE = (process.env.REACT_APP_STREAMR || 'streamr/broker-node:latest').split(':')[0];
const PRESEARCH_REPO_BASE = (process.env.REACT_APP_PRE_SEARCH || 'presearch/node:latest').split(':')[0];

/**
 * Join fluxinfo's running-app tally (name-keyed, since fluxinfo no longer
 * reports an image — issue #187) against a globalappsspecifications index
 * (name -> {repotag, category, ...}, from appSpecs.js's buildSpecIndex) to
 * recover everything the old image-based aggregation used to compute.
 *
 * Grouping happens by REPOTAG, not by app name: Flux app names are unique
 * per deployment (FoldingAtRunOnFlux13, palworld1786553912828, ...), so
 * grouping by name would scatter one popular image's ~thousands of
 * instances into as many single-count rows. A running app whose spec isn't
 * in the index (e.g. it expired between the two independent fetches) falls
 * back to being grouped under its own name rather than silently dropped, so
 * its containers still count toward totals — just not toward any specific
 * image's popularity ranking.
 */
export function categorizeRunningApps(aggregate, specIndex) {
  const nameCounts = aggregate?.nameCounts || {};
  const index = specIndex || {};

  const runningCategoryMap = {};
  const categoryImages = {}; // [category][repotagOrName] -> count, feeds buildCategoryTop
  const repoCounts = {}; // repotag -> count, for topRunningApps (unresolved names excluded — see below)
  let totalRunningApps = 0;

  for (const [name, count] of Object.entries(nameCounts)) {
    totalRunningApps += count;

    const spec = index[name];
    const category = spec?.category || 'other';
    runningCategoryMap[category] = (runningCategoryMap[category] || 0) + count;

    const repotag = spec?.repotag || '';
    const imageKey = repotag ? repotag.split(':')[0] : name;
    categoryImages[category] = categoryImages[category] || {};
    categoryImages[category][imageKey] = (categoryImages[category][imageKey] || 0) + count;

    if (repotag) {
      repoCounts[repotag] = (repoCounts[repotag] || 0) + count;
    }
  }

  const topRunningApps = Object.entries(repoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([image, nodeCount]) => ({ image, nodeCount }));

  // Count wordpress containers by iterating over nameCounts (since every app can run anywhere)
  let wordpressCount = 0;
  for (const [name, count] of Object.entries(nameCounts)) {
    const repotag = index[name]?.repotag || '';
    const repoBase = repotag.split(':')[0];
    if (repoBase === WORDPRESS_REPO_BASE) {
      wordpressCount += count;
    }
  }

  // Count streamr/presearch once per NODE that hosts them (from nodesByIp)
  let streamrNodes = 0;
  let presearchNodes = 0;

  for (const node of Object.values(aggregate?.nodesByIp || {})) {
    let hasStreamr = false;
    let hasPresearch = false;

    for (const name of node.containerAppNames || []) {
      const repotag = index[name]?.repotag || '';
      const repoBase = repotag.split(':')[0];
      if (repoBase === STREAMR_REPO_BASE) hasStreamr = true;
      if (repoBase === PRESEARCH_REPO_BASE) hasPresearch = true;
    }

    if (hasStreamr) streamrNodes++;
    if (hasPresearch) presearchNodes++;
  }

  return {
    runningCategoryMap,
    runningCategoryTop: buildCategoryTop(categoryImages),
    topRunningApps,
    wordpressCount,
    streamrRunningApps: streamrNodes,
    presearchRunningApps: presearchNodes,
    totalRunningApps
  };
}
