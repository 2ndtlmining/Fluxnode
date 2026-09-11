import { fluxos_version_desc, fluxos_version_desc_parse } from 'main/flux_version';
import { fetch_fluxinfo_aggregate } from 'fluxinfo';
import { buildSpecIndex } from 'appSpecs';
// A real import as well as the re-export below: `export { x } from 'y'` makes
// x available to IMPORTERS of this module, but does NOT bind it in this
// module's own scope. fetch_global_stats calls it directly.
import { fetch_global_app_specs_raw } from 'api/specs';
import { categorizeRunningApps } from 'runningAppsCategorized';
import { explorerFetchJson } from 'explorer';
import { REQUEST_OPTIONS_API } from 'api/endpoints';
import { OLD_ADDRESS_FLUX } from 'donor/config';
import {
  fetch_node_benchmarks,
  fetch_node_resources,
  fetch_node_geolocation,
  buildWorkhorseNodes
} from 'networkNodes';

import {
  CC_BLOCK_REWARD,
  CC_FLUX_REWARD_CUMULUS,
  CC_FLUX_REWARD_NIMBUS,
  CC_FLUX_REWARD_STRATUS,
  //CC_FLUX_REWARD_FRACTUS,
  CC_PA_REWARD,
  CC_COLLATERAL_CUMULUS,
  CC_COLLATERAL_NIMBUS,
  CC_COLLATERAL_STRATUS,
  //CC_COLLATERAL_FRACTUS
} from 'content/index';
import { appStore, StoreKeys } from 'persistance/store';

const API_DOS_LIST = 'https://api.runonflux.io/daemon/getdoslist';
const API_NODE_BENCHMARKS = 'https://stats.runonflux.io/fluxinfo?projection=benchmark';
const API_NODE_GEOLOCATION = 'https://stats.runonflux.io/fluxinfo?projection=geolocation';
const API_FLUX_NETWORK_UTILISATION = 'https://stats.runonflux.io/fluxinfo?projection=apps.resources';
const API_FLUX_ARCANE_VERSION = 'https://stats.runonflux.io/fluxinfo?projection=flux';


// Blocks per day at the 30-second block target: 1,440 minutes x 2 blocks.
// The name predates the rename from blocks to flux-per-block accounting;
// the value is a BLOCK count, which is what the CLC_NETWORK_* lines below
// multiply a per-block reward by. (issue #204 -- the old comment said
// '1 flux every 2 minutes', which would be 720, not 2,880.)
const FLUX_PER_DAY = (24 * 60) * 2;

const CLC_NETWORK_CUMULUS_PER_DAY = FLUX_PER_DAY * ((CC_BLOCK_REWARD * CC_FLUX_REWARD_CUMULUS) / 100.0);
const CLC_NETWORK_NIMBUS_PER_DAY = FLUX_PER_DAY * ((CC_BLOCK_REWARD * CC_FLUX_REWARD_NIMBUS) / 100.0);
const CLC_NETWORK_STRATUS_PER_DAY = FLUX_PER_DAY * ((CC_BLOCK_REWARD * CC_FLUX_REWARD_STRATUS) / 100.0);
//const CLC_NETWORK_FRACTUS_PER_DAY = FLUX_PER_DAY * ((CC_BLOCK_REWARD * CC_FLUX_REWARD_FRACTUS) / 100.0);

/* ======= global stats ======= */

export function tier_global_projections() {
  return {
    pay_frequency: 0 /* in minutes, display in days and hrs */,
    payment_amount: 0,
    pa_amount: 0,
    apy: 0
  };
}

export function create_global_store() {
  return {
    flux_price_usd: 0,
    totalRunningApps: 0,
    streamrRunningApps: 0,
    presearchRunningApps: 0,
    uniqueWalletAddressesCount: 0,
    wordpressCount: 0,
    enterpriseContainers: 0,
    unresolvedContainers: 0,
    fluxBlockHeight: 0,
    daemon_version: 0,
    node_count: {
      cumulus: 0,
      nimbus: 0,
      stratus: 0,
      //fractus: 0,
      total: 0
    },
    reward_projections: {
      cumulus: tier_global_projections(),
      nimbus: tier_global_projections(),
      stratus: tier_global_projections(),
      //fractus: tier_global_projections()
    },
    wallet_amount_flux: 0,
    fluxos_latest_version: fluxos_version_desc(0, 0, 0),
    bench_latest_version: fluxos_version_desc(0, 0, 0),
    current_block_height: 0,
    in_rich_list: false,
    total_donations: 0,
    arcane_os: {
      total_nodes: 0,
      arcane_nodes: 0,
      percentage: 0
    },

    total: {
      cores: 0,
      ram: 0,
      ssd: 0
    },
    utilized: {
      cores: 0,
      nodes: 0,
      ram: 0,
      ssd: 0,
      cores_percentage: 0,
      nodes_percentage: 0,
      ram_percentage: 0,
      ssd_percentage: 0
    },
    topRunningApps: [],
    runningCategoryMap: {},
    runningCategoryTop: {},
    topNodesByApps: [],
    nodePaymentAddresses: [],
    workhorseNodes: [],
    // Provenance for the running-app figures above. `runningAppsStatus` is one
    // of 'live' | 'stale' | 'unavailable' so the UI can say what it is showing
    // instead of silently swapping in a different dataset (see issue #144).
    runningAppsStatus: 'unavailable',
    runningAppsFetchedAt: null
  };
}

function fill_tier_g_projection(projectionTargetObj, nodeCount, networkFluxPerDay, collateral) {
  // pay freq = node_count * 2 minutes
  projectionTargetObj.pay_frequency = nodeCount / 2;

  /* ---- */

  const rewardPerPerson = networkFluxPerDay / nodeCount;
  projectionTargetObj.payment_amount = rewardPerPerson;

  /* ---- */

  const pa_amount = (rewardPerPerson * CC_PA_REWARD) / 100.0;
  projectionTargetObj.pa_amount = pa_amount;

  projectionTargetObj.apy = 100 * (((rewardPerPerson + pa_amount) * 365) / collateral);
}

/* removed factus
function fill_tier_g_projection_fractus(projectionTargetObj, nodeCount, networkFluxPerDay, collateral) {
  // pay freq = node_count * 2 minutes
  projectionTargetObj.pay_frequency = nodeCount / 2;

 
  const rewardPerPerson = networkFluxPerDay / nodeCount;
  projectionTargetObj.payment_amount = rewardPerPerson * 1.15; // 15% Native flux


  const pa_amount = (rewardPerPerson * CC_PA_REWARD) / 100.0;
  projectionTargetObj.pa_amount = pa_amount;

  projectionTargetObj.apy = 100 * (((rewardPerPerson * 1.15 + pa_amount) * 365) / collateral);
}
*/


// Exported so the reward maths can be unit tested. It is the most
// financially sensitive calculation in the app and #147 will move it.
export function fill_rewards(gstore) {
  fill_tier_g_projection(
    gstore.reward_projections.cumulus,
    gstore.node_count.cumulus,
    CLC_NETWORK_CUMULUS_PER_DAY,
    CC_COLLATERAL_CUMULUS
  );
  fill_tier_g_projection(
    gstore.reward_projections.nimbus,
    gstore.node_count.nimbus,
    CLC_NETWORK_NIMBUS_PER_DAY,
    CC_COLLATERAL_NIMBUS
  );
  fill_tier_g_projection(
    gstore.reward_projections.stratus,
    gstore.node_count.stratus,
    CLC_NETWORK_STRATUS_PER_DAY,
    CC_COLLATERAL_STRATUS
  );
  /* removed factus
  fill_tier_g_projection_fractus(
    gstore.reward_projections.fractus,
    gstore.node_count.cumulus,
    CLC_NETWORK_FRACTUS_PER_DAY,
    CC_COLLATERAL_FRACTUS
  );
  */
}

/*
 * Counts how many donation TRANSACTIONS a wallet has sent -- not a FLUX sum.
 * main/Gamification/achievements.js gates `donor` (>= 1), `super_donor` (>= 5)
 * and `sugar_daddy` (>= 50) on this count, and its labels read "N / 5
 * donations", so the unit is transactions.
 *
 * Scans BOTH donation addresses. The project's address changed 2026-09-03, and
 * this function used to scan only the current one -- so every donation made
 * before that date was invisible, costing early supporters achievements they
 * had already earned. donor/donorStatus.js:166 was fixed for the same reason in
 * PR #196; this was the second, unfixed copy of that bug. The asymmetry made it
 * easy to miss: donorStatus.js still granted those wallets premium access, so
 * only the achievements silently disappeared.
 *
 * Each address is scanned independently and a failure of one does not erase the
 * other: an unreachable explorer for one address must not zero out donations
 * already proven against the other. Only when BOTH scans fail outright does
 * this resolve 0.
 *
 * Results are de-duplicated by txid, because a single transaction paying both
 * addresses would otherwise be counted twice.
 */
export function fetch_total_donations(walletAddress) {
  return new Promise((resolve) => {
    // Routed through the explorer pool (explorer.js) rather than one hardcoded
    // host: a 429 on the primary now fails over instead of ending the scan.
    // explorerFetchJson already rejects non-2xx and non-JSON bodies -- the
    // "Loading block index..." text/plain case this used to handle by hand.
    const safeFetchJson = (path) => explorerFetchJson(path);

    // Every page for one address. Returns null (not []) when the address could
    // not be read at all, so "explorer unreachable" stays distinguishable from
    // "this address has no donations".
    const scanAddress = async (address) => {
      const basePath = '/txs?address=' + address;
      const firstPage = await safeFetchJson(basePath);
      if (!firstPage) return null;

      const { pagesTotal } = firstPage;
      const pageNums = pagesTotal <= 1 ? [] : new Array(pagesTotal - 1).fill(0).map((_v, i) => i + 1);

      // fetch pages sequentially (or in small batches) instead of all at once
      const pages = [firstPage];
      for (const page of pageNums) {
        const json = await safeFetchJson(`${basePath}&pageNum=${page}`);
        if (json) pages.push(json);
      }

      return pages.reduce((prev, current) => prev.concat(current.txs || []), []);
    };

    (async () => {
      const scans = [];
      for (const address of [window.gContent.ADDRESS_FLUX, OLD_ADDRESS_FLUX]) {
        scans.push(await scanAddress(address));
      }

      if (scans.every((txs) => txs === null)) {
        resolve(0); // explorer unavailable - fail gracefully instead of crashing
        return;
      }

      const countedTxids = new Set();
      for (const txs of scans) {
        if (!txs) continue;
        for (const tx of txs) {
          if (!tx.vin?.some((v) => v.addr === walletAddress)) continue;
          countedTxids.add(tx.txid);
        }
      }

      resolve(countedTxids.size);
    })();
  });
}

export async function fetch_arcane_os_stats(gstore) {
  const store = gstore;

  try {
    console.log('Fetching ArcaneOS stats from:', API_FLUX_ARCANE_VERSION);
    const res = await fetch(API_FLUX_ARCANE_VERSION);
    const json = await res.json();

    console.log('API Response status:', json.status);
    console.log('API Response data length:', json.data ? json.data.length : 'No data');

    if (json.status !== 'error' && json.data) {
      const totalNodes = json.data.length;
      
      // Count nodes with arcaneHumanVersion field inside flux object (like Python code)
      const arcaneNodes = json.data.filter(node => {
        return node.flux && 
               node.flux.arcaneHumanVersion !== undefined && 
               node.flux.arcaneHumanVersion !== null && 
               node.flux.arcaneHumanVersion !== "";
      }).length;

      // Calculate percentage
      const percentage = totalNodes > 0 ? (arcaneNodes / totalNodes) * 100 : 0;

      const firstArcaneNode = json.data.find(
        node => node.flux && node.flux.arcaneHumanVersion
      );
      const humanVersion = firstArcaneNode?.flux?.arcaneHumanVersion ?? null;

      store.arcane_os = {
        total_nodes: totalNodes,
        arcane_nodes: arcaneNodes,
        percentage: percentage,
        humanVersion: humanVersion
      };

      console.log('Final ArcaneOS Stats:', {
        total: totalNodes,
        arcane: arcaneNodes,
        percentage: percentage.toFixed(2) + '%'
      });
      
      // Log some sample arcaneHumanVersion values for verification
      const arcaneVersions = json.data
        .filter(node => node.flux && node.flux.arcaneHumanVersion !== undefined)
        .map(node => node.flux.arcaneHumanVersion)
        .slice(0, 10);
      
      console.log('Sample arcaneHumanVersion values:', arcaneVersions);
      
      // Also count different versions like Python code does
      const versionCounts = {};
      json.data.forEach(node => {
        if (node.flux && node.flux.arcaneHumanVersion) {
          const version = node.flux.arcaneHumanVersion;
          versionCounts[version] = (versionCounts[version] || 0) + 1;
        }
      });
      
      console.log('Version counts:', versionCounts);
      
    } else {
      console.log('API returned error or no data:', json);
      store.arcane_os = {
        total_nodes: 0,
        arcane_nodes: 0,
        percentage: 0,
        humanVersion: null
      };
    }
  } catch (error) {
    console.log('Error fetching ArcaneOS stats:', error);
    // Set default values on error
    store.arcane_os = {
      total_nodes: 0,
      arcane_nodes: 0,
      percentage: 0,
      humanVersion: null
    };
  }

  return store;
}
export async function fetch_total_network_utils(gstore) {
  const store = gstore;

  /*
   * Both of these projections were also being fetched by
   * fetch_global_performance_rankings, so benchmark (~3.45 MB) and geolocation
   * were each pulled twice per home-page load. They now go through shared
   * in-flight fetchers, so whichever caller asks first wins and the other
   * joins the same request.
   */
  const [resourceData, benchmarkData] = await Promise.all([
    fetch_node_resources(),
    fetch_node_benchmarks()
  ]);

  store.nodeResources = resourceData;
  store.nodeBenchmarks = benchmarkData;

  if (resourceData.length > 0) {
    const emptyNodes = resourceData.filter((data) => data.apps.resources.appsRamLocked === 0).length;

    store.utilized.nodes = store.node_count.total - emptyNodes;

    // Total locked resources
    store.utilized.ram =
      resourceData.reduce((prev, current) => prev + current.apps.resources.appsRamLocked, 0) / 1000000; // MB to TB;
    store.utilized.cores = resourceData.reduce((prev, current) => prev + current.apps.resources.appsCpusLocked, 0);
    store.utilized.ssd = resourceData.reduce((prev, current) => prev + current.apps.resources.appsHddLocked, 0) / 1000; // GB to TB;

    // Utilised Node Percentage
    store.utilized.nodes_percentage = (store.utilized.nodes / store.node_count.total) * 100;
  }

  if (benchmarkData.length > 0) {
    let totalRam = 0,
      totalSsd = 0,
      totalCores = 0;

    for (const data of benchmarkData) {
      totalRam = totalRam + data.benchmark.bench.ram;
      totalSsd = totalSsd + data.benchmark.bench.ssd;
      totalCores = totalCores + data.benchmark.bench.cores;
    }

    // Covert from GB to TB
    store.total.ram = totalRam / 1000;
    store.total.ssd = totalSsd / 1000;

    store.total.cores = totalCores;

    // Utilized Resources Percentage
    store.utilized.ram_percentage = (store.utilized.ram / store.total.ram) * 100;
    store.utilized.ssd_percentage = (store.utilized.ssd / store.total.ssd) * 100;
    store.utilized.cores_percentage = (store.utilized.cores / store.total.cores) * 100;
  }

  /*
   * Workhorse showcase: the busiest nodes on the network, joined against data
   * already in hand. topNodesByApps rides on the ecosystem panel's fetch,
   * benchmarks and resources are the ones just awaited above, and geolocation
   * is shared with the rankings panel — so this costs no extra request.
   */
  try {
    if (store.topNodesByApps?.length) {
      const geoData = await fetch_node_geolocation();
      store.workhorseNodes = buildWorkhorseNodes(
        store.topNodesByApps,
        benchmarkData,
        geoData,
        resourceData,
        store.nodePaymentAddresses
      );
    }
  } catch (error) {
    console.warn('[workhorse] could not build showcase:', error?.message);
  }

  // Fetch ArcaneOS stats
  await fetch_arcane_os_stats(store);

  /*
   * Return a new top-level object rather than the one we were handed.
   *
   * This function mutates the store in place, so callers doing
   * setState({ gstore: store }) were storing the reference they already had.
   * Downstream useMemo hooks keyed on [gstore] therefore never recomputed and
   * updated block height / utilisation figures never reached them. Nested
   * objects are intentionally still shared — only the identity changes.
   */
  const updated = { ...store };
  window.gstore = updated;
  return updated;
}

export async function fetch_global_stats(walletAddress = null) {
  const store = create_global_store();

  const fetchCurrency = async () => {
    try {
      const json = await explorerFetchJson('/currency');
      if (json?.data?.rate != null) store.flux_price_usd = json.data.rate;
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchWallet = async () => {
    try {
      if (walletAddress) {
        const json = await explorerFetchJson('/addr/' + walletAddress + '/?noTxList=1');
        if (json && json.balance != null) {
          const balance = json.balance;
          store.wallet_amount_flux = Math.round((balance + Number.EPSILON) * 100) / 100;
        }
      }
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchNode = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/getzelnodecount');
      const json = await res.json();
      const stats = json.data;

      store.node_count.cumulus = stats['cumulus-enabled'];
      store.node_count.nimbus = stats['nimbus-enabled'];
      store.node_count.stratus = stats['stratus-enabled'];

      store.node_count.total = stats['total'];
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchBenchVer = async () => {
    try {
      const res = await fetch('https://raw.githubusercontent.com/RunOnFlux/flux/master/package.json');
      if (res.status === 200) {
        const json = await res.json();
        store.fluxos_latest_version = fluxos_version_desc_parse(json['version']);
      }
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchFluxVer = async () => {
  try {
    const res = await fetch('https://raw.githubusercontent.com/RunOnFlux/flux/refs/heads/master/helpers/benchmarkinfo.json');
    if (res.status === 200) {
      const json = await res.json();
      store.bench_latest_version = fluxos_version_desc_parse(json.version);
    }
  } catch (error) {
    console.log('Failed to fetch benchmark version:', error);
    // store.bench_latest_version will remain at default (0, 0, 0)
  }
};

  /*
   * daemon/getinfo used to be fetched twice per refresh — once here for
   * current_block_height and again in getFluxBlockInfo for fluxBlockHeight,
   * which is the same field under a second name. Both keys are kept because
   * different views read different ones, but there is now one request.
   *
   * This also gains a try/catch it never had: fetchBlockHeight threw straight
   * into the Promise.all below, so a single blip on this endpoint failed the
   * entire global stats load.
   */
  const fetchDaemonInfo = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/getinfo');
      const json = await res.json();
      const info = json?.data;

      const blocks = info?.blocks ?? 0;
      store.current_block_height = blocks;
      store.fluxBlockHeight = blocks;
      store.daemon_version = info?.version ?? 0;
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchRichList = async () => {
    try {
      const json = await explorerFetchJson('/statistics/richest-addresses-list');
      if (Array.isArray(json)) {
        store.in_rich_list = json.some((wAddress) => wAddress.address === walletAddress);
      }
    } catch (error) {
      console.log('error', error);
    }
  };

  /*
   * Derives every running-app figure from the single shared fluxinfo fetch.
   * Also supplies wordpressCount, which used to come from a second, identical
   * request to the same endpoint.
   */
  const fetchTotalDeployedApps = async () => {
    const { aggregate, status, fetchedAt } = await fetch_fluxinfo_aggregate();

    store.runningAppsStatus = status;
    store.runningAppsFetchedAt = fetchedAt;

    if (!aggregate) return;

    // Carried on the store before the spec join below, same as before —
    // the Workhorse showcase and DonorTab both read these directly off
    // aggregate's shape.
    store.topNodesByApps = aggregate.topNodesByApps || [];
    store.nodesByIp = aggregate.nodesByIp || {};

    // fluxinfo no longer reports a docker image (#187) — category, repotag,
    // wordpress/streamr/presearch detection all now require joining each
    // running app's NAME against globalappsspecifications. That fetch is
    // its own safe, shared, sessionStorage-cached layer (Task 2), so this
    // costs a real network request only on a cold cache.
    const rawSpecs = await fetch_global_app_specs_raw();
    const specIndex = buildSpecIndex(rawSpecs);

    const categorized = categorizeRunningApps(aggregate, specIndex);

    store.totalRunningApps = categorized.totalRunningApps;
    store.streamrRunningApps = categorized.streamrRunningApps;
    store.presearchRunningApps = categorized.presearchRunningApps;
    store.wordpressCount = categorized.wordpressCount;
    store.enterpriseContainers = categorized.enterpriseContainers;
    store.unresolvedContainers = categorized.unresolvedContainers;
    store.topRunningApps = categorized.topRunningApps;
    store.runningCategoryMap = categorized.runningCategoryMap;
    store.runningCategoryTop = categorized.runningCategoryTop;
  };

  const fetchUniqueWalletAddresses = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/viewdeterministiczelnodelist');
      const json = await res.json();
      const nodeList = Array.isArray(json?.data) ? json.data : [];
      const uniquePaymentAddresses = new Set();
      nodeList.forEach((item) => {
        uniquePaymentAddresses.add(item.payment_address);
      });
      store.uniqueWalletAddressesCount = Array.from(uniquePaymentAddresses).length;

      // Retained so the Workhorse showcase can link a node to its wallet
      // without a second trip for the same list.
      store.nodePaymentAddresses = nodeList;
    } catch (error) {
      console.log('error', error);
    }
  };

  // NOTE: fetchWordpressInstancesCount used to live here and issued a second,
  // byte-identical request to stats.runonflux.io/fluxinfo alongside
  // fetchTotalDeployedApps. store.wordpressCount is now derived from the shared
  // aggregate, with the same matching rule (exact runonflux/wp-nginx, any tag).

  await Promise.all([
    fetchCurrency(),
    fetchWallet(),
    fetchNode(),
    fetchBenchVer(),
    fetchFluxVer(),
    fetchDaemonInfo(),
    fetchRichList(),
    fetchTotalDeployedApps(),
    fetchUniqueWalletAddresses()
  ]);

  fill_rewards(store);
  
  // Add ArcaneOS data fetching
  await fetch_arcane_os_stats(store);
  
  window.gstore = store;
  console.log('store', store);
  return store;
}


// Fetch USD Latest currency rate
// Currency rates now live in client/src/currency.js so they can be unit
// tested. Re-exported here to keep existing import paths working.
export { lazy_load_currency_rate, SUPPORTED_CURRENCIES } from 'currency';

/* ======================================================================= */
/* ======================================================================= */
/* =========================== Fractus Count =========================== */

/*
async function lazy_load_fractus_count(benchmarks) {
  try {
    const storedFractusCount = await appStore.getItem(StoreKeys.FRACTUS_COUNT);
    if (storedFractusCount) return storedFractusCount;

    const thunderCount = benchmarks.filter((data) => data.benchmark.bench.thunder).length;

    appStore.setItem(StoreKeys.FRACTUS_COUNT, thunderCount);
    return thunderCount;
  } catch (e) {
    console.error(e);
  }
}

/* ======================================================================= */
/* ======================================================================= */
/*
 * Wallet nodes moved to api/walletNodes.js (issue #147). Re-exported here
 * so no call site changes in this pass; importers migrate to the new path
 * incrementally, and this barrel goes away once none are left.
 */
export {
  wallet_health_full,
  calc_mtn_window,
  DISPLAY_DATE_FORMAT,
  normalize_raw_node_tier,
  getWalletNodes,
  getEnterpriseNodes,
  transformRawNode,
  fillPartialNode,
  fill_health,
  validateAddress,
  getDemoWallet
} from 'api/walletNodes';

export { buildTierResolver, fetch_global_performance_rankings, fetch_country_node_counts, _extract_country_counts } from 'api/rankings';
export { pa_summary_full, wallet_pas_summary } from 'api/parallelAssets';
export { fetch_global_app_specs, fetch_global_app_specs_raw } from 'api/specs';


const API_GPU_PRICES_URL = 'https://service.fluxcore.ai/api/getGPUPrices';
const GPU_PRICES_CACHE_KEY = 'gpuPrices_v1';
const GPU_PRICES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function fetch_gpu_prices() {
  try {
    const raw = sessionStorage.getItem(GPU_PRICES_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GPU_PRICES_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    const res = await fetch(API_GPU_PRICES_URL, { ...REQUEST_OPTIONS_API });
    const json = await res.json();
    if (!Array.isArray(json)) return null;

    const totalGPUs = json.reduce((s, g) => s + (g.number_of_gpus || 0), 0);
    const totalComputers = json.reduce((s, g) => s + (g.number_of_computers || 0), 0);
    const models = json
      .filter((g) => g.number_of_gpus > 0)
      .sort((a, b) => b.number_of_gpus - a.number_of_gpus);

    const data = { models, totalGPUs, totalComputers };
    try {
      sessionStorage.setItem(GPU_PRICES_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      console.warn('[GPU] Cache write failed:', e?.message);
    }
    return data;
  } catch {
    return null;
  }
}

export async function isWalletDOSState(address) {
  // Note: DOS list is updated very frequently, so there is no point in caching the response for
  // future wallet addresses.

  const listResponse = await fetch(API_DOS_LIST);
  const json = await listResponse.json();
  const dosList = json['data'];

  for (let i = 0; i < dosList.length; i++)
    //
    if (dosList[i]['payment_address'] == address)
      //
      return true;

  return false;
}