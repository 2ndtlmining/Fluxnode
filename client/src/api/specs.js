/*
 * Extracted from apidata.js (issue #147). This is a MOVE, not a rewrite: the
 * code below is unchanged, and apidata.js re-exports it, so no call site
 * changes in this pass.
 */

/*
 * Global application specifications.
 *
 * Self-contained: every external symbol it needs (specResources,
 * buildSpecIndex, categorizeAppSpec) already comes from its own module, so
 * nothing had to be duplicated or exported to move this out.
 *
 * Named api/specs.js rather than api/appSpecs.js to stay distinct from the
 * existing src/appSpecs.js, which owns the per-spec resource maths this calls
 * into. Two files with the same basename and different jobs is how you get an
 * import pointing at the wrong one.
 */

import { specResources, buildSpecIndex } from 'appSpecs';
import { categorizeAppSpec } from 'main/Gamification/appCategories';

/* ================================================================ */
/* =================== GLOBAL APP SPECIFICATIONS ================= */
/* ================================================================ */

const BLOCKS_PER_DAY = 2880; // 30 sec/block

const RAW_APP_SPECS_CACHE_KEY = 'homeAppSpecsRaw_v1';
const RAW_APP_SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RAW_APP_SPECS_STALE_KEYS = ['homeAppSpecs_v2']; // old key cached the full computed (height-dependent) result

// Fields any downstream consumer actually reads off a raw spec (#153) — see
// appSpecs.js's specResources()/buildSpecIndex(), appCategories.js's
// categorizeAppSpec(), and live/apidata.js's diffDeployedForEvents(). This is
// only what gets WRITTEN to sessionStorage; the in-memory return value below
// (`json.data`) stays full/untrimmed for every caller. `cpu`/`ram`/`hdd` are
// required for the LEGACY no-compose branch of specResources() (an app with
// no `compose` array reads its resources straight off the top-level spec —
// dropping them would silently show "0.00 cores/0GB/0GB" for those apps on a
// warm cache read, the same class of bug this file's appSpecs.js comment
// already describes fixing once for enterprise apps). `description` is read
// by live/apidata.js's diffDeployedForEvents() for the Live page's deploy
// event detail panel.
const SPEC_CACHE_FIELDS = ['name', 'height', 'expire', 'instances', 'enterprise', 'owner', 'repotag', 'cpu', 'ram', 'hdd', 'description'];
const COMPOSE_CACHE_FIELDS = ['name', 'repotag', 'cpu', 'ram', 'hdd'];

function _trimSpecForCache(spec) {
  const trimmed = {};
  for (const f of SPEC_CACHE_FIELDS) {
    if (spec?.[f] !== undefined) trimmed[f] = spec[f];
  }
  if (Array.isArray(spec?.compose)) {
    trimmed.compose = spec.compose.map((c) => {
      const tc = {};
      for (const f of COMPOSE_CACHE_FIELDS) {
        if (c?.[f] !== undefined) tc[f] = c[f];
      }
      return tc;
    });
  }
  return trimmed;
}

let _rawAppSpecsInFlight = null;

function _prune_stale_app_spec_caches() {
  for (const key of RAW_APP_SPECS_STALE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

/*
 * Raw globalappsspecifications array only — no block-height-dependent
 * computation, so this is safe to cache and safe to call from more than one
 * place in a page load. fetch_global_app_specs() below layers the height-
 * dependent expiring/deployed-today lists on top, recomputed fresh every
 * call, specifically so a caller with a not-yet-populated fluxBlockHeight
 * (fetchTotalDeployedApps runs concurrently with fetchDaemonInfo) can never
 * poison this cache with a wrong result that a later, correct caller then
 * reads back within the TTL.
 */
export async function fetch_global_app_specs_raw() {
  _prune_stale_app_spec_caches();

  try {
    const raw = sessionStorage.getItem(RAW_APP_SPECS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Array.isArray(cached.data) && Date.now() - cached.timestamp < RAW_APP_SPECS_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  if (_rawAppSpecsInFlight) return _rawAppSpecsInFlight;

  _rawAppSpecsInFlight = (async () => {
    try {
      const res = await fetch('https://api.runonflux.io/apps/globalappsspecifications');
      const json = await res.json();
      // Array.isArray, not a truthiness check: this function's callers iterate
      // the result and three of them (AppsSection, AppsTab, and
      // fetchTotalDeployedApps inside fetch_global_stats' bare Promise.all)
      // have no .catch — a `data` object rather than an array would take the
      // whole Home page load down with it.
      if (json.status === 'error' || !Array.isArray(json.data)) return [];

      const trimmedForCache = json.data.map(_trimSpecForCache);
      try {
        const payload = JSON.stringify({ data: trimmedForCache, timestamp: Date.now() });
        sessionStorage.setItem(RAW_APP_SPECS_CACHE_KEY, payload);
      } catch (e) {
        // Log the TRIMMED payload's size, not json.data's — trimmedForCache
        // is what actually hit the quota, and can be several times smaller
        // than the untrimmed array; logging the wrong number here would
        // mislead exactly the debugging this warning exists for.
        console.warn('[AppSpecs] Cache write failed:', e?.message, `(${JSON.stringify(trimmedForCache).length} bytes)`);
      }

      return json.data; // full, untrimmed — every in-memory caller keeps working exactly as before
    } catch (e) {
      console.warn('[AppSpecs] Failed to fetch:', e);
      return [];
    }
  })();

  try {
    return await _rawAppSpecsInFlight;
  } finally {
    _rawAppSpecsInFlight = null;
  }
}

/*
 * Never rejects — deliberately. Three callers have no .catch of their own
 * (AppsSection, analytics/AppsTab, and fetchTotalDeployedApps, which sits in
 * fetch_global_stats' bare Promise.all where a rejection would fail the entire
 * Home page load: price, wallet, node counts, everything). Any failure here,
 * fetch or compute, resolves to the same empty shape instead.
 */
export async function fetch_global_app_specs(gstore) {
  const specs = await fetch_global_app_specs_raw();
  const empty = { expiringToday: [], deployedToday: [], networkCategories: [], rawSpecs: [] };
  if (!Array.isArray(specs) || specs.length === 0) return empty;

  try {
    const currentBlock = gstore.fluxBlockHeight || 0;
    const expiringToday = [];
    const deployedToday = [];
    const categoryMap = {};

    for (const spec of specs) {
      const instances = spec.instances || 1;
      const { cpuPerInst, ramGBPerInst, ssdGBPerInst } = specResources(spec);
      const cat = categorizeAppSpec(spec);
      categoryMap[cat] = (categoryMap[cat] || 0) + instances;

      const specHeight = spec.height || 0;
      const deployedAgeBlocks = currentBlock - specHeight;
      const enriched = { ...spec, instances, cpuPerInst, ramGBPerInst, ssdGBPerInst, category: cat };

      if (currentBlock > 0 && deployedAgeBlocks >= 0 && deployedAgeBlocks < BLOCKS_PER_DAY) {
        deployedToday.push({ ...enriched, deployedAgeBlocks });
      }

      if (spec.expire) {
        const expiryBlock = specHeight + spec.expire;
        const expiresInBlocks = expiryBlock - currentBlock;
        if (currentBlock > 0 && expiresInBlocks >= 0 && expiresInBlocks < BLOCKS_PER_DAY) {
          expiringToday.push({ ...enriched, expiresInBlocks });
        }
      }
    }

    expiringToday.sort((a, b) => a.expiresInBlocks - b.expiresInBlocks);
    deployedToday.sort((a, b) => a.deployedAgeBlocks - b.deployedAgeBlocks);

    const networkCategories = Object.entries(categoryMap)
      .map(([category, totalInstances]) => ({ category, totalInstances }))
      .sort((a, b) => b.totalInstances - a.totalInstances);

    return { expiringToday, deployedToday, networkCategories, rawSpecs: specs };
  } catch (e) {
    console.warn('[AppSpecs] Failed to compute:', e);
    return empty;
  }
}
