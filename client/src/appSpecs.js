import { categorizeAppSpec } from 'main/Gamification/appCategories';

/*
 * One place to read resources off a global app specification.
 *
 * This calculation previously existed twice — in fetch_global_app_specs and in
 * AppsSection's specMap — and both copies carried the same bug: summing an
 * empty compose array yields 0, so enterprise apps reported a confident
 * "0.00 cores" instead of "unknown". Fixing one left the other broken, and the
 * second was only caught by someone looking at the page.
 *
 * The Workhorse showcase needed it a third time, which is what finally made
 * extracting it worthwhile. Consolidating this is called for in #147.
 */

/**
 * Resources reserved per instance, plus the primary repotag.
 *
 * Returns nulls rather than zeros when the figures are genuinely unknown, which
 * is the case for enterprise apps: their `compose` is present but encrypted, so
 * there is nothing to sum.
 */
export function specResources(spec) {
  const composeList = Array.isArray(spec?.compose) ? spec.compose : null;
  const isEnterprise = !!spec?.enterprise && composeList?.length === 0;

  if (isEnterprise) {
    return {
      cpuPerInst: null,
      ramGBPerInst: null,
      ssdGBPerInst: null,
      repotag: '',
      isEnterprise: true
    };
  }

  if (composeList) {
    return {
      cpuPerInst: composeList.reduce((sum, c) => sum + (c.cpu || 0), 0),
      ramGBPerInst: composeList.reduce((sum, c) => sum + (c.ram || 0), 0) / 1024,
      ssdGBPerInst: composeList.reduce((sum, c) => sum + (c.hdd || 0), 0),
      repotag: composeList[0]?.repotag || '',
      isEnterprise: false
    };
  }

  return {
    cpuPerInst: spec?.cpu || 0,
    ramGBPerInst: (spec?.ram || 0) / 1024,
    ssdGBPerInst: spec?.hdd || 0,
    repotag: spec?.repotag || '',
    isEnterprise: false
  };
}

/**
 * Name -> { category, ...resources } for every spec, so a consumer holding only
 * an app name can render the same figures the spec panels show.
 */
export function buildSpecIndex(rawSpecs) {
  const index = {};
  for (const spec of rawSpecs || []) {
    if (!spec?.name) continue;
    const composeList = Array.isArray(spec.compose) && spec.compose.length > 0 ? spec.compose : null;
    index[spec.name] = {
      ...specResources(spec),
      category: categorizeAppSpec(spec),
      instances: spec.instances || 1,
      // Per-component repotags, for consumers that need the EXACT image a
      // specific running container is (not just the spec's primary/first
      // one) — see repotagForComponent below. Only the name/repotag pairs are
      // kept; nothing else off `compose` is needed here. null for
      // single-component and enterprise specs, which have no distinct
      // components to resolve.
      compose: composeList ? composeList.map((c) => ({ name: c?.name, repotag: c?.repotag || '' })) : null
    };
  }
  return index;
}

/**
 * The exact repotag for one component of a running app, given that app's
 * buildSpecIndex() entry and the component name recovered from its container
 * name (fluxinfo.js's componentFromContainer). Falls back to the entry's
 * aggregate `.repotag` (component 0, or the spec's own top-level repotag for
 * single-component apps) when the component can't be matched — a spec update
 * mid-flight, or a null/empty component for a single-component app.
 */
export function repotagForComponent(indexEntry, component) {
  if (!indexEntry) return '';
  if (!indexEntry.compose || !component) return indexEntry.repotag || '';
  const match = indexEntry.compose.find((c) => c.name === component);
  return match?.repotag || indexEntry.repotag || '';
}
