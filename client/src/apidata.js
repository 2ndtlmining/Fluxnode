import dayjs from 'dayjs';

import { format_minutes } from 'utils';
import { fluxos_version_desc, fluxos_version_string, fluxos_version_desc_parse } from 'main/flux_version';
import { categorizeAppSpec } from 'main/Gamification/appCategories';
import { fetch_fluxinfo_aggregate } from 'fluxinfo';
import { specResources, buildSpecIndex } from 'appSpecs';
import { categorizeRunningApps } from 'runningAppsCategorized';
import { explorerFetchJson } from 'explorer';
import { OLD_ADDRESS_FLUX } from 'donor/config';
import {
  fetch_node_benchmarks,
  fetch_node_resources,
  fetch_node_geolocation,
  buildWorkhorseNodes
} from 'networkNodes';
import { topInGroup } from 'main/Gamification/rankInGroup';

import { FLUXNODE_INFO_API_MODE, FLUXNODE_INFO_API_URL } from 'app-buildinfo';

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

const API_FLUX_NODES_ALL_PATH = '/status?q=getFluxNodes';
const API_FLUX_NODE_URL = 'https://api.runonflux.io/daemon/viewdeterministiczelnodelist?filter=';
const API_DOS_LIST = 'https://api.runonflux.io/daemon/getdoslist';
const API_NODE_BENCHMARKS = 'https://stats.runonflux.io/fluxinfo?projection=benchmark';
const API_NODE_GEOLOCATION = 'https://stats.runonflux.io/fluxinfo?projection=geolocation';
const API_FLUX_NETWORK_UTILISATION = 'https://stats.runonflux.io/fluxinfo?projection=apps.resources';
const API_FLUX_ARCANE_VERSION = 'https://stats.runonflux.io/fluxinfo?projection=flux';

const API_NODE_INFO_ENDPOINT = '/flux/info';
const API_FLUX_APPLIST_ENDPOINT = '/apps/installedapps';
const API_FLUX_UPTIME_ENDPOINT = '/flux/systemuptime';

const FLUX_PER_DAY = (24 * 60) * 2; /* 1 flux every 2 minutes */

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

/* ======= node health ======= */

function wallet_health_entry() {
  return {
    node_count: 0,
    projection_daily: { flux: 0, usd: 0 },
    projection_montly: { flux: 0, usd: 0 }
  };
}

export function wallet_health_full() {
  return {
    cumulus: wallet_health_entry(),
    nimbus: wallet_health_entry(),
    stratus: wallet_health_entry(),
    //fractus: wallet_health_entry(),
    total_nodes: 0
  };
}

/* ======= nodes overview ======= */

const REQUEST_OPTIONS_API = {
  credentials: 'omit',
  headers: {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5'
  },
  method: 'GET',
  mode: 'cors'
};

function empty_flux_node() {
  return {
    id: 0,
    maybe_online: false,
    ip_full: {
      host: '',
      port: null,

      active_port_api: null,
      active_port_os: null
    },
    ip_display: false,
    tier: 'UNKNOWN', // "CUMULUS" | "NIMBUS" | "STRATUS" | "FRACTUS" | "UNKNOWN"
    rank: -1,
    last_reward: '-',
    next_reward: '-',
    benchmark_status: 'unknown', // 'unknown' | 'failed' | 'passed' | 'offline' | 'running'
    bench_version: fluxos_version_desc(0, 0, 0),
    flux_os: fluxos_version_desc(0, 0, 0),
    cores: 0,
    threads: 0,
    eps: 0,
    ram: 0,
    dws: 0,
    total_storage: 0,
    down_speed: 0,
    up_speed: 0,
    last_benchmark: '-',
    appCount: 0,
    uptime: 0,
    score: 0,

    last_confirmed_height: 0
    // maintenance_win: '-'
  };
}

function calc_next_reward(rank) {
  return format_minutes(rank / 2);
}

export function calc_mtn_window(last_confirmed_height, current_height) {
  const BLOCK_RATE = 480;
  //480 blocks at 30second blocks 240 minutes

  const win = BLOCK_RATE - (current_height - last_confirmed_height);

  if (win <= 0) return 'Closed';

  return format_minutes(win / 2);
}

export const DISPLAY_DATE_FORMAT = 'DD-MMM-YYYY HH:mm:ss';

const DEFAULT_FLUX_PORT_API = 16127;
const DEFAULT_FLUX_PORT_OS = 16126;

export function normalize_raw_node_tier(node) {
  return node['tier'].toUpperCase();
}

export async function getWalletNodes(walletAddress) {
  // implement and live in the dark(background) so we can turn it on when ranking feature is fixed
  let wNodes = [];
  if (process.env.REACT_APP_ENABLE_FLUX_NODE_API === 'true') {
    try {
      const res = await fetch(API_FLUX_NODE_URL + walletAddress);
      wNodes = (await res.json())?.data;
    } catch {}
  } else {
    // Through the explorer pool: this is the wallet-search path, so a rate
    // limit here means a user sees no nodes at all.
    const data = await explorerFetchJson(API_FLUX_NODES_ALL_PATH);
    wNodes = Array.isArray(data?.fluxNodes)
      ? data.fluxNodes.filter((n) => n.payment_address == walletAddress)
      : [];
  }
  return wNodes;
}

export async function getEnterpriseNodes() {
  let enterpriseNodes = [];
  try {
    const res = await fetch('https://api.runonflux.io/apps/enterprisenodes');
    enterpriseNodes = (await res.json())?.data;
    // console.log('getEnterpriseNodes-----', enterpriseNodes);
  } catch (e) {
    console.log('getEnterpriseNodes', e);
  }

  return enterpriseNodes;
}

export function transformRawNode(node) {
  let fluxNode = empty_flux_node();
  const ipRaw = node['ip'];
  if (ipRaw) {
    fluxNode.maybe_online = true;

    const ipParts = ipRaw.split(':');

    fluxNode.ip_full.host = ipParts[0];
    if (ipParts.length > 1) {
      const portApi = +ipParts[1] || DEFAULT_FLUX_PORT_API;

      fluxNode.ip_full.port = portApi;

      fluxNode.ip_full.active_port_api = portApi;
      fluxNode.ip_full.active_port_os = portApi - 1;
    } else {
      fluxNode.ip_full.port = null;

      fluxNode.ip_full.active_port_api = DEFAULT_FLUX_PORT_API;
      fluxNode.ip_full.active_port_os = DEFAULT_FLUX_PORT_OS;
    }

    fluxNode.id = ipRaw;
    fluxNode.ip_display = ipRaw;
  } else {
    fluxNode.id = node['txhash'];
  }

  fluxNode.tier = normalize_raw_node_tier(node);
  fluxNode.rank = node['rank'] || 0;
  fluxNode.last_reward = dayjs.unix(node['lastpaid']).format(DISPLAY_DATE_FORMAT);
  fluxNode.next_reward = calc_next_reward(node.rank);
  fluxNode.last_confirmed_height = node['last_confirmed_height'] || 0;

  return fluxNode;
}

function make_offline(fluxNode) {
  fluxNode.benchmark_status = 'offline';
  return undefined;
}

function _fillPartial_bench_info(fluxNode, bench_info) {
  if (bench_info !== null) fluxNode.bench_version = fluxos_version_desc_parse(bench_info['version']);
}

function _fillPartial_benchmarks(fluxNode, benchmarks) {
  if (benchmarks === null) return make_offline(fluxNode);

  switch (benchmarks['benchmark_status']) {
    case 'failed':
      fluxNode.benchmark_status = 'failed';
      break;
    case 'running':
      fluxNode.benchmark_status = 'running';
      break;

    default:
      fluxNode.benchmark_status = 'passed';
  }

  fluxNode.threads = parseInt(benchmarks['cores'] || 0);
  fluxNode.eps = benchmarks['eps'] || 0;
  fluxNode.ram = benchmarks['ram'] || 0;
  fluxNode.dws = benchmarks['ddwrite'] || 0;
  fluxNode.total_storage = benchmarks['totalstorage'] || 0;
  fluxNode.down_speed = benchmarks['download_speed'] || 0;
  fluxNode.up_speed = benchmarks['upload_speed'] || 0;
  fluxNode.thunder = benchmarks['thunder'] || false;

  fluxNode.last_benchmark = dayjs.unix(benchmarks['time']).format(DISPLAY_DATE_FORMAT);
}
function _fillPartial_version(fluxNode, version) {
  if (version !== null) fluxNode.flux_os = fluxos_version_desc_parse(version);
}
function _fillPartial_apps(fluxNode, installedApps) {
  if (installedApps !== null) {
    fluxNode.appCount = installedApps?.length;
    fluxNode.installedApps = installedApps;
  }
}

function _fillPartial_uptime(fluxNode, uptime) {
  if (uptime !== null) fluxNode.uptime = uptime;
}

const make_node_ip = (fluxNode) => fluxNode.ip_full.host + ':' + fluxNode.ip_full.active_port_api;

let _fetchAndFillNodeInfo;
if (FLUXNODE_INFO_API_MODE === 'proxy') {
  _fetchAndFillNodeInfo = async (fluxNode) => {
    let responseOK = false;
    let jsonData = {};

    try {
      const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/node-single/` + make_node_ip(fluxNode), {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        }
      });

      responseOK = response.status == 200;
      jsonData = await response.json();
    } catch {}

    if (!(responseOK && jsonData['success'])) return make_offline(fluxNode);

    let targetNode = jsonData['node']['results'];

    _fillPartial_bench_info(fluxNode, targetNode['node_info'].data?.benchmark?.info);
    _fillPartial_benchmarks(fluxNode, targetNode['node_info'].data?.benchmark?.bench);
    _fillPartial_version(fluxNode, targetNode['node_info'].data?.flux?.version);
    _fillPartial_apps(fluxNode, targetNode['apps'].data);
    _fillPartial_uptime(fluxNode, targetNode['uptime'].data);
  };
}
// FLUXNODE_INFO_API_MODE == 'debug'
else {
  _fetchAndFillNodeInfo = async (fluxNode) => {
    let server = 'http://' + make_node_ip(fluxNode);

    const promiseNodeInfo = fetch(server + API_NODE_INFO_ENDPOINT, { ...REQUEST_OPTIONS_API });
    const promiseAppList = fetch(server + API_FLUX_APPLIST_ENDPOINT, { ...REQUEST_OPTIONS_API });
    const promiseUptimeData = fetch(server + API_FLUX_UPTIME_ENDPOINT, { ...REQUEST_OPTIONS_API });

    let reqSuccess;

    let resultNodeInfo;
    let resultAppList;
    let resultUptime;

    try {
      [resultNodeInfo, resultAppList, resultUptime] = await Promise.all([
        promiseNodeInfo,
        promiseAppList,
        promiseUptimeData
      ]);
      reqSuccess = true;
    } catch {
      reqSuccess = false;
    }

    if (reqSuccess) {
      const nodeInfo = (await resultNodeInfo.json())?.data;
      _fillPartial_bench_info(fluxNode, nodeInfo?.benchmark?.info);
      _fillPartial_benchmarks(fluxNode, nodeInfo?.benchmark?.bench);
      _fillPartial_version(fluxNode, nodeInfo?.flux?.version);
      _fillPartial_apps(fluxNode, (await resultAppList.json()).data);
      _fillPartial_uptime(fluxNode, (await resultUptime.json()).data);
    }
  };
}

export async function fillPartialNode(node) {
  // Do not try to reach servers if they are confirmed to be offline
  if (!node.maybe_online) return make_offline(node);

  await _fetchAndFillNodeInfo(node);
}

function fill_tier_health(target, tierRewardProjections, fluxPriceUsd) {
  target.projection_daily.flux =
    target.node_count * (tierRewardProjections.payment_amount + tierRewardProjections.pa_amount);
  target.projection_daily.usd = target.projection_daily.flux * fluxPriceUsd;

  target.projection_montly.flux = target.projection_daily.flux * 30.0;
  target.projection_montly.usd = target.projection_daily.usd * 30.0;
}

export function fill_health(health, gstore) {
  fill_tier_health(health.cumulus, gstore.reward_projections.cumulus, gstore.flux_price_usd);
  fill_tier_health(health.nimbus, gstore.reward_projections.nimbus, gstore.flux_price_usd);
  fill_tier_health(health.stratus, gstore.reward_projections.stratus, gstore.flux_price_usd);
  // Fractus is parts of Cumulus tier
  //fill_tier_health(health.fractus, gstore.reward_projections.fractus, gstore.flux_price_usd);
}

export async function validateAddress(address) {
  try {
    const res = await fetch('https://api.runonflux.io/explorer/balance?address=' + address);
    const json = await res.json();
    return json['data'] !== undefined;
  } catch {
    return false;
  }
}

export async function getDemoWallet() {
  try {
    const response = await fetch(`${FLUXNODE_INFO_API_URL}/api/v1/demo`, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });
    const jsonData = await response.json();
    return jsonData;
  } catch {
    return null;
  }
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
/* =========================== PARALLEL ASSETS =========================== */
/* ======================================================================= */
/* ======================================================================= */

function single_pa_info() {
  return {
    possible_claimable: 0,
    amount_claimed: 0,
    fusion_fee: 0,
    paid: 0,
    amount_received: 0
  };
}

export function pa_summary_full() {
  return {
    total_claimable: 0,
    total_claimed_to_date: 0,
    total_mined: 0,
    assets: {
      kda: single_pa_info(),
      eth: single_pa_info(),
      bsc: single_pa_info(),
      trn: single_pa_info(),
      sol: single_pa_info(),
      avx: single_pa_info(),
      erg: single_pa_info(),
      algo: single_pa_info(),
      matic: single_pa_info(),
      base: single_pa_info()
    }
  };
}

async function fetch_fusion_fees() {
  const resp = await fetch('https://fusion.runonflux.io/fees', {
    mode: 'cors'
  });
  const result = await resp.json();

  return result?.data?.mining;
}

async function fetch_wallet_pas(walletAddress) {
  try {
    const resp = await fetch(`https://fusion.runonflux.io/coinbase/summary?address=${walletAddress}`, {
      mode: 'cors'
    });
    const json = await resp.json();

    return json.data;
  } catch (error) {
    console.error('Error fetching wallet PAS:', error);
    throw error;
  }
}

export async function wallet_pas_summary(walletAddress) {
  const promiseFees = fetch_fusion_fees();
  const promiseFusion = fetch_wallet_pas(walletAddress);

  const [resultFees, resultFusion] = await Promise.allSettled([promiseFees, promiseFusion]);

  const summary = pa_summary_full();

  if (resultFusion.status == 'fulfilled') {
    const fusion = resultFusion.value;

    summary.total_claimable = fusion.maxClaimableTotal - fusion.claimedTotal;
    summary.total_claimed_to_date = fusion.claimedTotal;
    summary.total_mined = fusion.maxClaimableTotal;

    for (const stats of fusion.chainStatistics) {
      let targetPAInfo = null;
      switch (stats.chain) {
        case 'kda':
          targetPAInfo = summary.assets.kda;
          break;
        case 'eth':
          targetPAInfo = summary.assets.eth;
          break;
        case 'bsc':
          targetPAInfo = summary.assets.bsc;
          break;
        case 'trx':
          targetPAInfo = summary.assets.trn;
          break;
        case 'sol':
          targetPAInfo = summary.assets.sol;
          break;
        case 'avax':
          targetPAInfo = summary.assets.avx;
          break;
        case 'erg':
          targetPAInfo = summary.assets.erg;
          break;
        case 'algo':
          targetPAInfo = summary.assets.algo;
          break;
        case 'matic':
          targetPAInfo = summary.assets.matic;
          break;
        case 'base':
          targetPAInfo = summary.assets.base;
          break;

        default:
          break;
      }

      if (targetPAInfo == null) continue;

      targetPAInfo.possible_claimable = stats.possibleToClaim;
      targetPAInfo.amount_claimed = stats.claimedAmount;
      targetPAInfo.paid = stats.feesPaid;
      targetPAInfo.amount_received = stats.receivedAmount;
    }
  }

  if (resultFees.status == 'fulfilled' && resultFees.value) {
    const fees = resultFees.value;

    summary.assets.kda.fusion_fee = fees['kda'];
    summary.assets.eth.fusion_fee = fees['eth'] ? fees['eth'] : 5;
    summary.assets.bsc.fusion_fee = fees['bsc'];
    summary.assets.trn.fusion_fee = fees['trx'];
    summary.assets.sol.fusion_fee = fees['sol'];
    summary.assets.avx.fusion_fee = fees['avax'];
    summary.assets.erg.fusion_fee = fees['erg'];
    summary.assets.algo.fusion_fee = fees['algo'];
    summary.assets.matic.fusion_fee = fees['matic'];
    summary.assets.base.fusion_fee = fees['base'] ? fees['base'] : 0;
  }

  return summary;
}

/* ===================================================== */
/* ======================== DOS ======================== */
/* ===================================================== */

/* ================================================================ */
/* ================ GLOBAL PERFORMANCE RANKINGS ================== */
/* ================================================================ */

function _flagFromCountryCode(cc) {
  if (!cc || cc.length !== 2) return '';
  const base = 0x1f1e6 - 65;
  return (
    String.fromCodePoint(cc.charCodeAt(0) + base) +
    String.fromCodePoint(cc.charCodeAt(1) + base)
  );
}

const GLOBAL_RANKINGS_CACHE_KEY = 'globalPerfRankings_v5';
const GLOBAL_RANKINGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
// v4 rows carried a full `geo` object; v5 carries `cc` only (#153). A
// leftover v4 entry would silently yield zero country ranks, so it is
// pruned rather than left to expire.
const GLOBAL_RANKINGS_STALE_KEYS = ['globalPerfRankings_v3', 'globalPerfRankings_v4'];

function _prune_stale_global_rankings_caches() {
  for (const key of GLOBAL_RANKINGS_STALE_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {}
  }
}

/**
 * Resolves a benchmark entry's `ipaddress` to its tier.
 *
 * Issue #215: this used to be a plain `host -> tier` map built by stripping the
 * port. One host can run several Flux nodes OF DIFFERENT TIERS, so they
 * collided and whichever entry the API returned last won for all of them.
 * Measured on a live fixture: 254 hosts run mixed tiers, and 788 of 6237
 * benchmarked nodes (12.6%) were assigned the wrong one -- always upward,
 * since the API returns a host's nodes in ascending-tier order. Cumulus
 * operators were being ranked against Nimbus and Stratus hardware.
 *
 * Both feeds carry the port that separates these nodes. The old code discarded
 * exactly the field that made them distinguishable.
 *
 * Resolution order, with the live counts each path serves (2026-09-11):
 *
 *   1. Exact match on the ip string as it appears        4035 entries
 *   2. Bare ip, when both feeds report it bare           2151 (free -- the
 *                                                        key is the raw string)
 *   3. Host fallback, ONLY if that host runs one tier      60 entries where the
 *                                                        feeds disagree about
 *                                                        including a port
 *   4. Otherwise null                                       0 today
 *
 * Rule 4 is the point. When a host runs mixed tiers and no exact key matched,
 * there is no honest answer, so this returns null and the caller drops the node
 * -- exactly as it already does for an unknown host. Guessing is what caused
 * the bug.
 *
 * Verified lossless against a live fixture: every benchmarked node that
 * resolved under the old host-collapsed map still resolves here, and the
 * per-tier totals move from 2397/1996/1855 to 3026/1580/1631 against the
 * daemon's authoritative 3119/1581/1634.
 */
export function buildTierResolver(fluxNodes) {
  const byExactIp = new Map();
  const tiersByHost = new Map();

  for (const node of (Array.isArray(fluxNodes) ? fluxNodes : [])) {
    const raw = node?.ip || '';
    if (!raw) continue;
    const tier = (node.tier || '').toUpperCase();
    if (!tier) continue;

    byExactIp.set(raw, tier);

    const host = raw.split(':')[0];
    if (!tiersByHost.has(host)) tiersByHost.set(host, new Set());
    tiersByHost.get(host).add(tier);
  }

  return function resolveTier(ipAddress) {
    const raw = ipAddress || '';
    if (!raw) return null;

    const exact = byExactIp.get(raw);
    if (exact) return exact;

    // Only safe where the host is unambiguous; a mixed-tier host has no
    // defensible answer without the port.
    const tiers = tiersByHost.get(raw.split(':')[0]);
    if (tiers && tiers.size === 1) return tiers.values().next().value;
    return null;
  };
}

/**
 * Fetches and joins node list (tier), benchmark data, and geolocation for all
 * ~8000 Flux nodes. Builds a flat nodeData array plus two small precomputed
 * aggregates (tierWinners, countryTierCounts) — see issue #153: the old
 * pre-sorted tierRankings/countryRankings shape duplicated every node 12+
 * times and was the single biggest sessionStorage-quota offender. Results
 * are cached in sessionStorage for 10 minutes.
 *
 * Returns: { nodeData, tierWinners, countryTierCounts, officialNodeCounts,
 * countryDominance, nodeGeoMap, addressGeoMap } or null on failure.
 */
export async function fetch_global_performance_rankings() {
  _prune_stale_global_rankings_caches();

  // Return cached data if fresh
  try {
    const raw = sessionStorage.getItem(GLOBAL_RANKINGS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GLOBAL_RANKINGS_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    // benchmark and geolocation come from the shared fetchers so they are not
    // pulled a second time by fetch_total_network_utils / fetch_country_node_counts
    const [nodesJsonRaw, benchData, geoData, countRes] = await Promise.all([
      explorerFetchJson(API_FLUX_NODES_ALL_PATH),
      fetch_node_benchmarks(),
      fetch_node_geolocation(),
      fetch('https://api.runonflux.io/daemon/getzelnodecount'),
    ]);

    const nodesJson = nodesJsonRaw || {};
    const benchJson = { data: benchData };
    const geoJson = { data: geoData };
    const countJson = await countRes.json();

    // Official enabled node counts — same source as the dashboard header
    const officialNodeCounts = {
      CUMULUS: countJson.data?.['cumulus-enabled'] || 0,
      NIMBUS:  countJson.data?.['nimbus-enabled']  || 0,
      STRATUS: countJson.data?.['stratus-enabled'] || 0,
    };

    // ip:port → tier, with a guarded host fallback. See buildTierResolver.
    const resolveTier = buildTierResolver(nodesJson.fluxNodes);

    // IP host → geo
    // API shape: { data: [ { geolocation: { ip, country, countryCode, continent, ... } } ] }
    const nodeGeoMap = {};
    for (const entry of (Array.isArray(geoJson.data) ? geoJson.data : [])) {
      const geo = entry.geolocation;
      if (!geo) continue;
      const host = (geo.ip || '').split(':')[0];
      if (!host) continue;
      const cc = geo.countryCode || geo.country_code;
      if (!cc) continue;
      nodeGeoMap[host] = {
        country: geo.country || cc,
        countryCode: cc,
        continent: geo.continent || '',
        flag: _flagFromCountryCode(cc),
      };
    }

    // Country dominance: count all nodes per wallet per country to find the leader in each country.
    // Uses payment_address from the tier endpoint (same source as wallet node lookup).
    //
    // The same loop also builds addressGeoMap (payment_address -> geo): the
    // Live page resolves a block reward's real payout address to a country
    // this way, since geo elsewhere is only ever keyed by IP. A wallet with
    // nodes in more than one country just gets whichever this loop sees last
    // — a reasonable "somewhere this operator runs" answer, not a claim of
    // precision.
    const countryDominance = {};
    const addressGeoMap = {};
    {
      const countryWalletCounts = {}; // cc → { country, counts: { addr → count } }
      for (const node of (Array.isArray(nodesJson.fluxNodes) ? nodesJson.fluxNodes : [])) {
        const host = (node.ip || '').split(':')[0];
        if (!host || !node.payment_address) continue;
        const geo = nodeGeoMap[host];
        if (!geo?.countryCode) continue;
        const cc = geo.countryCode;
        if (!countryWalletCounts[cc]) {
          countryWalletCounts[cc] = { country: geo.country, counts: {} };
        }
        const addr = node.payment_address;
        countryWalletCounts[cc].counts[addr] = (countryWalletCounts[cc].counts[addr] || 0) + 1;
        addressGeoMap[addr] = geo;
      }
      for (const [cc, data] of Object.entries(countryWalletCounts)) {
        const leaderCount = Math.max(0, ...Object.values(data.counts));
        countryDominance[cc] = { leaderCount, country: data.country };
      }
    }

    // Build unified node list from benchmark data
    // API shape: { data: [ { benchmark: { bench: { ipaddress, eps, ddwrite, download_speed, upload_speed, ... } } } ] }
    const VALID_TIERS = new Set(['CUMULUS', 'NIMBUS', 'STRATUS']);
    const nodeData = [];
    for (const entry of (Array.isArray(benchJson.data) ? benchJson.data : [])) {
      const bench = entry.benchmark?.bench;
      if (!bench) continue;
      const host = (bench.ipaddress || '').split(':')[0];
      if (!host) continue;
      // Resolve from the FULL ip:port, not the bare host -- a host can run
      // several nodes of different tiers (issue #215).
      const tier = resolveTier(bench.ipaddress);
      if (!tier || !VALID_TIERS.has(tier)) continue;
      nodeData.push({
        ip: host,
        tier,
        eps: bench.eps || 0,
        dws: bench.ddwrite || 0,
        down_speed: bench.download_speed || 0,
        up_speed: bench.upload_speed || 0,
        // Country CODE only -- not the whole geo record.
        //
        // This used to inline nodeGeoMap[host], duplicating each host's full
        // geolocation object (country, countryCode, continent, lat, lon, org,
        // region, city) once per NODE, while nodeGeoMap already stores the
        // same records once per HOST. With ~6,200 nodes across ~2,350 hosts
        // that was ~1 MB of pure duplication in a cache measured at 63% of
        // the sessionStorage quota (issue #153).
        //
        // Every consumer of the inlined object only ever read .countryCode
        // (achievements.js's two country-rank filters, and countryTierCounts
        // below). Anything needing the full record has nodeGeoMap, which is
        // cached alongside this and keyed by the same host -- see
        // live/apidata.js's lookupNodeInfo, which already works that way.
        cc: nodeGeoMap[host]?.countryCode || null,
      });
    }

    // Every consumer of this data (achievements.js's 6 dynamic functions,
    // NetworkTab's TopDogsPanel, _extract_country_counts below) only
    // ever needs ONE of: a specific wallet's own node's rank (computed
    // on demand via rankInGroup, cheap since it's only ever a handful of
    // nodes — see main/Gamification/rankInGroup.js), the single #1 node
    // per tier/metric (tierWinners, precomputed here), or a country's
    // node count (countryTierCounts, precomputed here). Nothing needs a
    // pre-sorted rank list for the whole network — that used to cost 12+
    // duplicated copies of every node (issue #153).
    const METRICS = ['eps', 'dws', 'down_speed', 'up_speed'];
    const TIERS = ['CUMULUS', 'NIMBUS', 'STRATUS'];

    const tierWinners = {};
    for (const tier of TIERS) {
      tierWinners[tier] = {};
      const tierNodes = nodeData.filter((n) => n.tier === tier);
      for (const metric of METRICS) {
        tierWinners[tier][metric] = topInGroup(tierNodes, metric);
      }
    }

    const countryTierCounts = {};
    for (const node of nodeData) {
      if (!node.cc) continue;
      const cc = node.cc;
      if (!countryTierCounts[cc]) {
        // The display name comes from nodeGeoMap rather than the row, which
        // now carries only the code.
        countryTierCounts[cc] = { country: nodeGeoMap[node.ip]?.country || cc, tiers: {} };
      }
      countryTierCounts[cc].tiers[node.tier] = (countryTierCounts[cc].tiers[node.tier] || 0) + 1;
    }

    const data = { nodeData, tierWinners, countryTierCounts, officialNodeCounts, countryDominance, addressGeoMap, nodeGeoMap };

    try {
      sessionStorage.setItem(
        GLOBAL_RANKINGS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch (e) {
      console.warn('[GlobalRankings] Cache write failed:', e?.message);
    }

    return data;
  } catch (e) {
    console.warn('[GlobalRankings] Failed to fetch:', e);
    return null;
  }
}

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

const HOME_GEO_CACHE_KEY = 'homeGeoCounts_v1';
const HOME_GEO_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetch_country_node_counts() {
  // Reuse the full rankings cache if available (populated by gamification tab)
  try {
    const raw = sessionStorage.getItem(GLOBAL_RANKINGS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < GLOBAL_RANKINGS_CACHE_TTL) {
        return _extract_country_counts(cached.data.countryTierCounts);
      }
    }
  } catch {}

  // Check lightweight geo cache
  try {
    const raw = sessionStorage.getItem(HOME_GEO_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < HOME_GEO_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  try {
    const json = { data: await fetch_node_geolocation() };
    const countryMap = {};
    for (const entry of json.data || []) {
      const geo = entry.geolocation;
      if (!geo) continue;
      const cc = geo.countryCode || geo.country_code;
      if (!cc) continue;
      if (!countryMap[cc]) countryMap[cc] = { country: geo.country || cc, countryCode: cc, nodeCount: 0 };
      countryMap[cc].nodeCount++;
    }
    const data = Object.values(countryMap).sort((a, b) => b.nodeCount - a.nodeCount);
    try {
      sessionStorage.setItem(HOME_GEO_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      console.warn('[Geo] Cache write failed:', e?.message);
    }
    return data;
  } catch {
    return [];
  }
}

export function _extract_country_counts(countryTierCounts) {
  if (!countryTierCounts) return [];
  return Object.entries(countryTierCounts)
    .map(([countryCode, { country, tiers }]) => ({
      country,
      countryCode,
      nodeCount: Object.values(tiers).reduce((sum, c) => sum + c, 0),
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
}

// ── GPU Prices (FluxAI) ──────────────────────────────────────────────────────

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