import * as dayjs from 'dayjs';

import { format_minutes } from 'utils';
import { fluxos_version_desc, fluxos_version_string, fluxos_version_desc_parse } from 'main/flux_version';
import { categorizeApp } from 'main/Gamification/appCategories';

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

const API_FLUX_NODES_ALL_URL = 'https://explorer.runonflux.io/api/status?q=getFluxNodes';
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
    fluxBlockHeight: 0,
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
    topRunningImages: [],
    runningCategoryMap: {}
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


function fill_rewards(gstore) {
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

export function fetch_total_donations(walletAddress) {
  return new Promise((resolve) => {
    const url = 'https://explorer.runonflux.io/api/txs?address=' + window.gContent.ADDRESS_FLUX;
    fetch(url)
      .then((res) => res.json())
      .then((firstPage) => {
        const { pagesTotal } = firstPage;
        const array = pagesTotal <= 1 ? [] : new Array(pagesTotal - 1).fill(0).map((_v, i) => i + 1);
        Promise.all(array.map((page) => fetch(url + `&pageNum=${page}`)))
          .then((results) => Promise.all(results.map((result) => result.json())))
          .then((json) => {
            const txs = [firstPage, ...json].reduce((prev, current) => prev.concat(current.txs), []);
            resolve(txs.filter((tx) => tx.vin.some((v) => v.addr === walletAddress)).length);
          });
      });
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

      store.arcane_os = {
        total_nodes: totalNodes,
        arcane_nodes: arcaneNodes,
        percentage: percentage
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
        percentage: 0
      };
    }
  } catch (error) {
    console.log('Error fetching ArcaneOS stats:', error);
    // Set default values on error
    store.arcane_os = {
      total_nodes: 0,
      arcane_nodes: 0,
      percentage: 0
    };
  }

  return store;
}
export async function fetch_total_network_utils(gstore) {
  const store = gstore;

  const [resFluxNetworkUtils, resNodeBenchmarks] = await Promise.allSettled([
    fetch(API_FLUX_NETWORK_UTILISATION),
    fetch(API_NODE_BENCHMARKS)
  ]);

  if (resFluxNetworkUtils.status == 'fulfilled') {
    const res = resFluxNetworkUtils.value;
    const json = await res.json();

    if (json.status !== 'error') {
      const emptyNodes = json.data.filter((data) => data.apps.resources.appsRamLocked === 0).length;

      store.utilized.nodes = store.node_count.total - emptyNodes;

      // Total locked resources
      store.utilized.ram =
        json.data.reduce((prev, current) => prev + current.apps.resources.appsRamLocked, 0) / 1000000; // MB to TB;
      store.utilized.cores = json.data.reduce((prev, current) => prev + current.apps.resources.appsCpusLocked, 0);
      store.utilized.ssd = json.data.reduce((prev, current) => prev + current.apps.resources.appsHddLocked, 0) / 1000; // GB to TB;

      // Utilised Node Percentage
      store.utilized.nodes_percentage = (store.utilized.nodes / store.node_count.total) * 100;
    }
  }

  if (resNodeBenchmarks.status == 'fulfilled') {
    let totalRam = 0,
      totalSsd = 0,
      totalCores = 0;
    const res = resNodeBenchmarks.value;
    const json = await res.json();
    if (json.status !== 'error') {
      for (const data of json.data) {
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
      //store.node_count.fractus = await lazy_load_fractus_count(json.data);
    }
  }

  // Fetch ArcaneOS stats
  await fetch_arcane_os_stats(store);

  window.gstore = store;
  return store;
}

export async function fetch_global_stats(walletAddress = null) {
  const store = create_global_store();

  const fetchCurrency = async () => {
    const res = await fetch('https://explorer.runonflux.io/api/currency');
    const json = await res.json();
    store.flux_price_usd = json.data.rate;
  };

  const fetchWallet = async () => {
    if (walletAddress) {
      const res = await fetch('https://explorer.runonflux.io/api/addr/' + walletAddress + '/?noTxList=1');
      const json = await res.json();
      const balance = json['balance'];
      store.wallet_amount_flux = Math.round((balance + Number.EPSILON) * 100) / 100;
    }
  };

  const fetchNode = async () => {
    const res = await fetch('https://api.runonflux.io/daemon/getzelnodecount');
    const json = await res.json();
    const stats = json.data;

    store.node_count.cumulus = stats['cumulus-enabled'];
    store.node_count.nimbus = stats['nimbus-enabled'];
    store.node_count.stratus = stats['stratus-enabled'];

    store.node_count.total = stats['total'];
  };

  const fetchBenchVer = async () => {
    const res = await fetch('https://raw.githubusercontent.com/RunOnFlux/flux/master/package.json');
    if (res.status === 200) {
      const json = await res.json();
      store.fluxos_latest_version = fluxos_version_desc_parse(json['version']);
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

  const fetchBlockHeight = async () => {
    const res = await fetch('https://api.runonflux.io/daemon/getinfo');
    const json = await res.json();
    store.current_block_height = json['data']['blocks'];
  };

  const fetchRichList = async () => {
    const res = await fetch('https://explorer.runonflux.io/api/statistics/richest-addresses-list');
    const json = await res.json();
    store.in_rich_list = json.some((wAddress) => wAddress.address === walletAddress);
  };

  const fetchTotalDeployedApps = async () => {
    const streamr = process.env.REACT_APP_STREAMR;
    const presearch = process.env.REACT_APP_PRE_SEARCH;
    const watchtower = 'containrrr/watchtower:latest'

    let totalRunningApps = 0;
    let streamrCount = 0;
    let presearchCount = 0;
    let watchtowerCount = 0;


    try {
      const res = await fetch('https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Image');
      const json = await res.json();

      const imageCounts = new Map();
      json?.data?.forEach((item) => {
        totalRunningApps += item?.apps?.runningapps?.length;
        if (JSON.stringify(item?.apps?.runningapps).includes(streamr)) streamrCount++;
        if (JSON.stringify(item?.apps?.runningapps).includes(presearch)) presearchCount++;
        if (JSON.stringify(item?.apps?.runningapps).includes('containrrr/watchtower:latest') || JSON.stringify(item?.apps?.runningapps).includes('containrrr/watchtower'))
          watchtowerCount++;
        for (const app of item?.apps?.runningapps || []) {
          const img = app.Image || '';
          if (!img) continue;
          imageCounts.set(img, (imageCounts.get(img) || 0) + 1);
        }
      });

      store.totalRunningApps = (totalRunningApps - watchtowerCount);
      store.streamrRunningApps = streamrCount;
      store.presearchRunningApps = presearchCount;
      store.topRunningImages = [...imageCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([image, nodeCount]) => ({ image, nodeCount }));

      // Category breakdown from actual running containers (more accurate than spec data)
      const categoryMap = {};
      for (const [image, count] of imageCounts.entries()) {
        const cat = categorizeApp(image.toLowerCase());
        categoryMap[cat] = (categoryMap[cat] || 0) + count;
      }
      store.runningCategoryMap = categoryMap;
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchUniqueWalletAddresses = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/viewdeterministiczelnodelist');
      const json = await res.json();
      const uniquePaymentAddresses = new Set();
      json?.data?.forEach((item) => {
        uniquePaymentAddresses.add(item.payment_address);
      });
      store.uniqueWalletAddressesCount = Array.from(uniquePaymentAddresses).length;
    } catch (error) {
      console.log('error', error);
    }
  };

  const fetchWordpressInstancesCount = async () => {
    try {
      const res = await fetch('https://stats.runonflux.io/fluxinfo?projection=apps.runningapps.Image');
      const json = await res.json();
      
      let wordpressCount = 0;

      if (json.status !== 'error' && json?.data) {
        json.data.forEach((item) => {
          if (item?.apps?.runningapps) {
            // Check each running app for WordPress images
            item.apps.runningapps.forEach((app) => {
              if (app.Image) {
                const imageName = app.Image.toLowerCase();
                // Match runonflux/wp-nginx with any tag variation or no tag
                if (imageName === 'runonflux/wp-nginx' || imageName.startsWith('runonflux/wp-nginx:')) {
                  wordpressCount++;
                }
              }
            });
          }
        });
      }

      store.wordpressCount = wordpressCount;
      console.log('WordPress instances count:', wordpressCount);
    } catch (error) {
      console.log('Error fetching WordPress instances:', error);
      // Set to 0 on error to prevent breaking the frontend
      store.wordpressCount = 0;
    }
  };

  const getFluxBlockInfo = async () => {
    try {
      const res = await fetch('https://api.runonflux.io/daemon/getinfo');
      const json = await res.json();
      store.fluxBlockHeight = json?.data?.blocks ?? 0;
    } catch (error) {
      console.log('error', error);
    }
  };

  await Promise.all([
    fetchCurrency(),
    fetchWallet(),
    fetchNode(),
    fetchBenchVer(),
    fetchFluxVer(),
    fetchBlockHeight(),
    fetchRichList(),
    fetchTotalDeployedApps(),
    fetchUniqueWalletAddresses(),
    fetchWordpressInstancesCount(),
    getFluxBlockInfo()
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

const DISPLAY_DATE_FORMAT = 'DD-MMM-YYYY HH:mm:ss';

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
    const listResponse = await fetch(API_FLUX_NODES_ALL_URL);
    const data = await listResponse.json();
    wNodes = data.fluxNodes.filter((n) => n.payment_address == walletAddress);
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
const usdCurrencyRate = async ()=> {
  let response = await fetch('https://api.frankfurter.app/latest?to=USD');
  const resData = await response.json();
  return resData.rates;
}


const CURRENCY_RATE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Fetch other currencies and store
export async function lazy_load_currency_rate() {

  const supportedCurrencies = ['USD', 'EUR', 'AUD'];
  const cached = await appStore.getItem(StoreKeys.CURRENCY_RATES);
  const isFresh = cached && cached.timestamp && (Date.now() - cached.timestamp < CURRENCY_RATE_TTL_MS);
  if (isFresh) {
    return cached.rates;
  }

  try {
    const res = await fetch('https://api.frankfurter.app/latest?to=' + supportedCurrencies.join(',') + '&base=USD');
    const json = await res.json();
    const currencyRates = json.rates;

    const usd = await usdCurrencyRate();
    const currencies = {...usd, ...currencyRates}
    console.log('rates:', currencies);

    if(res.ok){
      await appStore.setItem(StoreKeys.CURRENCY_RATES, { rates: currencies, timestamp: Date.now() });
      return currencies;
    }else{
      return null
    }

  } catch (error) {
    console.log(error);
    // Return stale data if available rather than nothing
    if (cached && cached.rates) return cached.rates;
  }
  return null;
}
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

  return result.data.mining;
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

  if (resultFees.status == 'fulfilled') {
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

const GLOBAL_RANKINGS_CACHE_KEY = 'globalPerfRankings_v3';
const GLOBAL_RANKINGS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches and joins node list (tier), benchmark data, and geolocation for all
 * ~8000 Flux nodes. Builds per-tier and per-country performance rankings.
 * Results are cached in sessionStorage for 10 minutes.
 *
 * Returns: { tierRankings, countryRankings, nodeGeoMap } or null on failure.
 */
export async function fetch_global_performance_rankings() {
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
    const [nodesRes, benchRes, geoRes, countRes] = await Promise.all([
      fetch(API_FLUX_NODES_ALL_URL),
      fetch(API_NODE_BENCHMARKS),
      fetch(API_NODE_GEOLOCATION),
      fetch('https://api.runonflux.io/daemon/getzelnodecount'),
    ]);

    const nodesJson = await nodesRes.json();
    const benchJson = await benchRes.json();
    const geoJson = await geoRes.json();
    const countJson = await countRes.json();

    // Official enabled node counts — same source as the dashboard header
    const officialNodeCounts = {
      CUMULUS: countJson.data?.['cumulus-enabled'] || 0,
      NIMBUS:  countJson.data?.['nimbus-enabled']  || 0,
      STRATUS: countJson.data?.['stratus-enabled'] || 0,
    };

    // IP host → tier
    const ipTierMap = {};
    for (const node of nodesJson.fluxNodes || []) {
      const host = (node.ip || '').split(':')[0];
      if (host) ipTierMap[host] = (node.tier || '').toUpperCase();
    }

    // IP host → geo
    // API shape: { data: [ { geolocation: { ip, country, countryCode, continent, ... } } ] }
    const nodeGeoMap = {};
    for (const entry of geoJson.data || []) {
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
    const countryDominance = {};
    {
      const countryWalletCounts = {}; // cc → { country, counts: { addr → count } }
      for (const node of nodesJson.fluxNodes || []) {
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
    for (const entry of benchJson.data || []) {
      const bench = entry.benchmark?.bench;
      if (!bench) continue;
      const host = (bench.ipaddress || '').split(':')[0];
      if (!host) continue;
      const tier = ipTierMap[host];
      if (!tier || !VALID_TIERS.has(tier)) continue;
      nodeData.push({
        ip: host,
        tier,
        eps: bench.eps || 0,
        dws: bench.ddwrite || 0,
        down_speed: bench.download_speed || 0,
        up_speed: bench.upload_speed || 0,
        geo: nodeGeoMap[host] || null,
      });
    }

    const METRICS = ['eps', 'dws', 'down_speed', 'up_speed'];
    const TIERS = ['CUMULUS', 'NIMBUS', 'STRATUS'];

    // Per-tier rankings
    const tierRankings = {};
    for (const tier of TIERS) {
      tierRankings[tier] = {};
      const tierNodes = nodeData.filter((n) => n.tier === tier);
      for (const metric of METRICS) {
        tierRankings[tier][metric] = [...tierNodes]
          .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
          .map((n, i) => ({ ip: n.ip, rank: i + 1, value: n[metric] }));
      }
    }

    // Per-country, per-tier rankings — nodes compete only within their own tier per country.
    // Structure: countryRankings[cc].tiers[TIER].metrics[metric] = [{ip, rank, value}]
    const countryRankings = {};
    for (const node of nodeData) {
      if (!node.geo?.countryCode) continue;
      const cc = node.geo.countryCode;
      if (!countryRankings[cc]) {
        countryRankings[cc] = {
          country: node.geo.country,
          countryCode: cc,
          flag: node.geo.flag,
          tiers: {},
        };
      }
      const tier = node.tier;
      if (!countryRankings[cc].tiers[tier]) {
        countryRankings[cc].tiers[tier] = {
          metrics: { eps: [], dws: [], down_speed: [], up_speed: [] },
        };
      }
      for (const metric of METRICS) {
        countryRankings[cc].tiers[tier].metrics[metric].push({ ip: node.ip, value: node[metric] || 0 });
      }
    }
    // Sort and assign ranks within each country+tier+metric
    for (const cc of Object.keys(countryRankings)) {
      for (const tier of Object.keys(countryRankings[cc].tiers)) {
        for (const metric of METRICS) {
          countryRankings[cc].tiers[tier].metrics[metric]
            .sort((a, b) => b.value - a.value)
            .forEach((entry, i) => { entry.rank = i + 1; });
        }
      }
    }

    const data = { tierRankings, countryRankings, nodeGeoMap, officialNodeCounts, countryDominance };

    try {
      sessionStorage.setItem(
        GLOBAL_RANKINGS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch {}

    return data;
  } catch (e) {
    console.warn('[GlobalRankings] Failed to fetch:', e);
    return null;
  }
}

/* ================================================================ */
/* =================== GLOBAL APP SPECIFICATIONS ================= */
/* ================================================================ */

const HOME_APP_SPECS_CACHE_KEY = 'homeAppSpecs_v1';
const HOME_APP_SPECS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BLOCKS_PER_DAY = 2880; // 30 sec/block

export async function fetch_global_app_specs(gstore) {
  try {
    const raw = sessionStorage.getItem(HOME_APP_SPECS_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && Date.now() - cached.timestamp < HOME_APP_SPECS_CACHE_TTL) {
        return cached.data;
      }
    }
  } catch {}

  const currentBlock = gstore.fluxBlockHeight || 0;
  const empty = { expiringToday: [], deployedToday: [], networkCategories: [], rawSpecs: [] };

  try {
    const res = await fetch('https://api.runonflux.io/apps/globalappsspecifications');
    const json = await res.json();

    if (json.status === 'error' || !json.data) return empty;

    const specs = json.data;
    const expiringToday = [];
    const deployedToday = [];
    const categoryMap = {};

    for (const spec of specs) {
      const isCompose = Array.isArray(spec.compose);
      const instances = spec.instances || 1;

      // Resource per instance — compose specs sum across components, flat specs read directly
      let cpuPerInst, ramGBPerInst, ssdGBPerInst;
      if (isCompose) {
        cpuPerInst = spec.compose.reduce((s, c) => s + (c.cpu || 0), 0);
        ramGBPerInst = spec.compose.reduce((s, c) => s + (c.ram || 0), 0) / 1024;
        ssdGBPerInst = spec.compose.reduce((s, c) => s + (c.hdd || 0), 0);
      } else {
        cpuPerInst = spec.cpu || 0;
        ramGBPerInst = (spec.ram || 0) / 1024;
        ssdGBPerInst = spec.hdd || 0;
      }

      // Categorize by compose image names first (more accurate than app name)
      let cat = 'other';
      if (isCompose) {
        for (const component of spec.compose) {
          const imageCat = categorizeApp((component.repotag || '').toLowerCase());
          if (imageCat !== 'other') { cat = imageCat; break; }
        }
      }
      if (cat === 'other') cat = categorizeApp((spec.repotag || spec.name || '').toLowerCase());
      categoryMap[cat] = (categoryMap[cat] || 0) + instances;

      // Deployed / expiring — spec.height is lowercase in the API
      const specHeight = spec.height || 0;
      const deployedAgeBlocks = currentBlock - specHeight;

      const enriched = { ...spec, instances, cpuPerInst, ramGBPerInst, ssdGBPerInst };

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

    const data = { expiringToday, deployedToday, networkCategories, rawSpecs: specs };

    try {
      sessionStorage.setItem(HOME_APP_SPECS_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}

    return data;
  } catch (e) {
    console.warn('[AppSpecs] Failed to fetch:', e);
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
        return _extract_country_counts(cached.data.countryRankings);
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
    const res = await fetch(API_NODE_GEOLOCATION);
    const json = await res.json();
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
    } catch {}
    return data;
  } catch {
    return [];
  }
}

function _extract_country_counts(countryRankings) {
  if (!countryRankings) return [];
  return Object.values(countryRankings)
    .map(({ country, countryCode, tiers }) => ({
      country,
      countryCode,
      nodeCount: Object.values(tiers).reduce(
        (sum, tier) => sum + (tier.metrics.eps?.length || 0), 0
      ),
    }))
    .sort((a, b) => b.nodeCount - a.nodeCount);
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