/*
 * Wallet nodes: fetching a wallet's nodes and turning raw daemon records into
 * the shape the node table renders.
 *
 * Extracted from apidata.js (issue #147). A MOVE, not a rewrite -- the code
 * below is unchanged. apidata.js re-exports it, so no call site changes in this
 * pass.
 *
 * This section came out cleanly because it is genuinely self-contained: none of
 * its ten exported functions is called from anywhere else in apidata.js, and
 * the four endpoint constants below are referenced nowhere outside it. That is
 * the test applied before cutting, rather than splitting on where the banner
 * comments happened to fall.
 *
 * It owns:
 *   getWalletNodes / getEnterpriseNodes   the daemon's node list for a wallet
 *   transformRawNode / fillPartialNode    raw record -> table row
 *   fill_health / wallet_health_full      per-wallet health rollup
 *   normalize_raw_node_tier               tier string normalisation
 *   calc_mtn_window                       maintenance window from block heights
 *   validateAddress                       address check
 */

import dayjs from 'dayjs';

import { format_minutes } from 'utils';
import { fluxos_version_desc, fluxos_version_desc_parse } from 'main/flux_version';
import { explorerFetchJson } from 'explorer';
import { EXPLORER_FLUX_NODES_PATH, REQUEST_OPTIONS_API } from 'api/endpoints';
import { FLUXNODE_INFO_API_MODE, FLUXNODE_INFO_API_URL } from 'app-buildinfo';

// Moved with the code that uses them: nothing outside this module reads any of
// these four.
const API_FLUX_NODE_URL = 'https://api.runonflux.io/daemon/viewdeterministiczelnodelist?filter=';
const API_DOS_LIST = 'https://api.runonflux.io/daemon/getdoslist';
const API_NODE_INFO_ENDPOINT = '/flux/info';
const API_FLUX_APPLIST_ENDPOINT = '/apps/installedapps';
const API_FLUX_UPTIME_ENDPOINT = '/flux/systemuptime';

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
    const data = await explorerFetchJson(EXPLORER_FLUX_NODES_PATH);
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

/*
 * Whether a wallet's nodes are on the daemon's DOS list.
 *
 * Moved here from apidata.js (issue #147) rather than into its own module: it
 * is a per-wallet node-health check, which is what this file is for, and a
 * fifteen-line module of its own would be over-splitting.
 */
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
