import { buildCategoryTop, splitComponentCountKey } from 'fluxinfo';
import { repotagForComponent } from 'appSpecs';
import { isOpaqueRuntimeImage } from 'main/Gamification/appCategories';

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
 * (name -> {repotag, category, compose, ...}, from appSpecs.js's
 * buildSpecIndex) to recover everything the old image-based aggregation used
 * to compute.
 *
 * Two tallies come out of fluxinfo and they are used for different things:
 *
 *   nameCounts      app-level, one entry per running container. Feeds the
 *                   category map, which is app-level by construction —
 *                   categorizeAppSpec already scans every compose component
 *                   for the first keyword match, so an app has one category
 *                   however many components it runs.
 *   componentCounts the same containers keyed by app name AND component, so
 *                   an image-level figure (Top Hosted Apps, the WordPress and
 *                   streamr/presearch tallies) resolves the repotag of the
 *                   component the container actually IS. Reading these off
 *                   nameCounts instead attributed every container of a compose
 *                   app to compose[0]'s image, which triple-counted the
 *                   3-component WordPress deployments and hid the other two
 *                   components' images from the ranking entirely.
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
  const componentCounts = aggregate?.componentCounts || {};
  const index = specIndex || {};

  const runningCategoryMap = {};
  const categoryImages = {}; // [category][repotagOrName] -> count, feeds buildCategoryTop
  let totalRunningApps = 0;

  for (const [name, count] of Object.entries(nameCounts)) {
    totalRunningApps += count;

    const spec = index[name];
    // runonflux/orbit is Flux's git-deployment wrapper: the real workload
    // inside it is opaque, so categorising it by the operator's arbitrary
    // deployment name is misleading. Pre-#187 aggregation forced these to
    // 'other'; restore that here rather than in the shared categorizeAppSpec,
    // which other pages (AppsSection, networkCategories) have never applied
    // it to and whose behaviour is not this branch's to change.
    const category = isOpaqueRuntimeImage(spec?.repotag) ? 'other' : spec?.category || 'other';
    runningCategoryMap[category] = (runningCategoryMap[category] || 0) + count;

    // App-level repotag (compose[0], or the spec's own for single-component
    // apps) — this loop has no per-container component context by design.
    const repotag = spec?.repotag || '';
    const imageKey = repotag ? repotag.split(':')[0] : name;
    categoryImages[category] = categoryImages[category] || {};
    categoryImages[category][imageKey] = (categoryImages[category][imageKey] || 0) + count;
  }

  // Image-level tallies, resolved per component (see the note above).
  const repoCounts = {}; // repotag -> count, for topRunningApps (unresolved names excluded)
  let wordpressCount = 0;

  for (const [key, count] of Object.entries(componentCounts)) {
    const { name, component } = splitComponentCountKey(key);
    const repotag = repotagForComponent(index[name], component);
    if (!repotag) continue;

    repoCounts[repotag] = (repoCounts[repotag] || 0) + count;
    if (repotag.split(':')[0] === WORDPRESS_REPO_BASE) {
      wordpressCount += count;
    }
  }

  const topRunningApps = Object.entries(repoCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([image, nodeCount]) => ({ image, nodeCount }));

  // Count streamr/presearch once per NODE that hosts them (from nodesByIp).
  // containerComponents is index-aligned with containerAppNames, so container
  // i resolves against its own component's repotag; a node counts once no
  // matter how many of its containers match.
  let streamrNodes = 0;
  let presearchNodes = 0;

  for (const node of Object.values(aggregate?.nodesByIp || {})) {
    let hasStreamr = false;
    let hasPresearch = false;
    const names = node.containerAppNames || [];
    const components = node.containerComponents || [];

    for (let i = 0; i < names.length; i++) {
      const repotag = repotagForComponent(index[names[i]], components[i] || null);
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
