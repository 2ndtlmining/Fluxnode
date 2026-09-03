// ── Recent blocks ────────────────────────────────────────────────────────────

/*
 * The block explorer's /api/blocks (Insight-style) gives real, historical
 * block data — height, hash, timestamp, and txlength — for however many of
 * the most recent blocks we ask for. This is the source of truth for the
 * chain rail: available immediately on page load, and a plain public HTTPS
 * endpoint with no proxy-mode or arbitrary-node-reachability requirement.
 */
const RECENT_BLOCKS_ENDPOINT = 'https://explorer.runonflux.io/api/blocks';
const TXS_BY_BLOCK_ENDPOINT = 'https://explorer.runonflux.io/api/txs/';

export async function fetch_recent_blocks(limit = 6) {
  try {
    const res = await fetch(`${RECENT_BLOCKS_ENDPOINT}?limit=${limit}`);
    const json = await res.json();
    const blocks = Array.isArray(json?.blocks) ? json.blocks : [];

    return blocks.map((b) => ({
      height: b.height,
      hash: b.hash,
      at: (b.time || 0) * 1000, // API gives seconds, JS wants ms
      txCount: b.txlength || 0,
    }));
  } catch {
    return [];
  }
}

// Fetches every transaction in a block in one call (page 0 — always enough
// to cover the coinbase plus a normal Flux block's handful of other txs) and
// splits it into the coinbase and everything else, which the caller derives
// rewards/confirmations and P2P transfers from respectively.
export async function fetch_block_transactions(blockHash) {
  try {
    const res = await fetch(`${TXS_BY_BLOCK_ENDPOINT}?block=${blockHash}`);
    const json = await res.json();
    const txs = Array.isArray(json?.txs) ? json.txs : [];
    const coinbase = txs.find((t) => t.isCoinBase) || txs[0] || null;
    const others = txs.filter((t) => t !== coinbase);
    return { coinbase, others };
  } catch {
    return { coinbase: null, others: [] };
  }
}

// ── Real reward extraction from the coinbase transaction ────────────────────

/*
 * Every block's first transaction is its coinbase — the block reward itself,
 * split across a handful of outputs. This is the real payout, not a
 * network-average projection: matching each output's share of the total
 * against the tier reward percentages (already known network constants)
 * identifies which output is which tier, by percentage rather than a fixed
 * vout index/count, so this keeps working if the payout tx's shape changes
 * (extra treasury outputs, reordering, etc.) as long as the tier splits
 * stay close to their configured percentages.
 */
const TIER_REWARD_PERCENT = {
  CUMULUS: window.gContent?.CC_FLUX_REWARD_CUMULUS,
  NIMBUS: window.gContent?.CC_FLUX_REWARD_NIMBUS,
  STRATUS: window.gContent?.CC_FLUX_REWARD_STRATUS,
};
const TIER_MATCH_TOLERANCE_PCT = 0.5;

export function extractRewardsFromCoinbase(coinbaseTx) {
  const totalOut = Number(coinbaseTx?.valueOut);
  if (!coinbaseTx?.isCoinBase || !totalOut || !Array.isArray(coinbaseTx.vout)) return [];

  const rewards = [];
  for (const vout of coinbaseTx.vout) {
    const value = Number(vout.value);
    const address = vout.scriptPubKey?.addresses?.[0];
    if (!value || !address) continue;

    const pct = (value / totalOut) * 100;
    const tier = Object.entries(TIER_REWARD_PERCENT).find(
      ([, expectedPct]) => expectedPct != null && Math.abs(pct - expectedPct) <= TIER_MATCH_TOLERANCE_PCT
    )?.[0];
    if (tier) rewards.push({ tier, address, amount: value });
  }
  return rewards;
}

// Turns raw {tier, address, amount} reward entries into full display events,
// resolving country via the address→geo map (built alongside the existing
// per-IP geo lookup in fetch_global_performance_rankings — see apidata.js).
export function buildRewardEvents(block, rewards, addressGeoMap) {
  return (rewards || []).map((r) => {
    const geo = addressGeoMap?.[r.address] || null;
    return {
      id: `reward-${r.tier}-${block.height}`,
      type: 'reward',
      tier: r.tier,
      blockHeight: block.height,
      paymentAddress: r.address,
      country: geo?.country || null,
      countryCode: geo?.countryCode || null,
      amount: r.amount, // real, exact — straight from the coinbase output
      at: Date.now(),
    };
  });
}

/*
 * Real node confirmations: Flux nodes periodically broadcast a "Confirming a
 * fluxnode" special transaction to stay active/eligible, carrying its own
 * `ip` and `benchmark_tier` fields directly — no address/tier cross-
 * referencing needed. These aren't part of a block's regular transaction
 * list (the explorer's /api/block and /api/txs endpoints both omit them —
 * they're a protocol-level special tx, stored outside the normal Merkle
 * tree), so they need the official daemon's own verbose getblock instead,
 * which is what actually contains them.
 */
const DAEMON_GETBLOCK_ENDPOINT = 'https://api.runonflux.io/daemon/getblock';
const CONFIRMING_TX_TYPE = 'Confirming a fluxnode';

export async function fetch_block_confirmations(blockHash) {
  try {
    const res = await fetch(`${DAEMON_GETBLOCK_ENDPOINT}/${blockHash}`);
    const json = await res.json();
    const txs = Array.isArray(json?.data?.tx) ? json.data.tx : [];
    return txs.filter((t) => t && typeof t === 'object' && t.type === CONFIRMING_TX_TYPE);
  } catch {
    return [];
  }
}

export function buildConfirmationEvents(block, confirmingTxs) {
  return (confirmingTxs || []).map((tx) => ({
    id: `confirm-${tx.txid}`,
    type: 'confirm',
    tier: (tx.benchmark_tier || '').toUpperCase(),
    blockHeight: block.height,
    ip: (tx.ip || '').split(':')[0], // some carry a :port suffix, some don't
    at: Date.now(),
  }));
}

const BENCHMARK_METRICS = ['eps', 'dws', 'down_speed', 'up_speed'];

/*
 * A deliberately cheap enrichment: country and real benchmark numbers for a
 * given node IP, both looked up from data the page already has in memory
 * (the same fetch_global_performance_rankings result used elsewhere) — no
 * new network request. This is display-time-only by design (called from the
 * component, not baked into the event when first created) so it always
 * reflects whatever rankings snapshot is currently loaded, not whatever was
 * loaded when the confirmation first arrived.
 *
 * Deliberately not extended to contact the node's own IP directly for live
 * stats — that's exactly the reachability/proxy-mode fragility the coinbase-
 * based approach was built to get away from.
 */
export function lookupNodeInfo(ip, tier, { nodeGeoMap, tierRankings } = {}) {
  const geo = ip ? nodeGeoMap?.[ip] : null;

  const tierMetrics = tier ? tierRankings?.[tier] : null;
  let benchmark = null;
  if (ip && tierMetrics) {
    for (const metric of BENCHMARK_METRICS) {
      const entry = Array.isArray(tierMetrics[metric]) ? tierMetrics[metric].find((r) => r.ip === ip) : null;
      if (entry) {
        if (!benchmark) benchmark = {};
        benchmark[metric] = entry.value;
      }
    }
  }

  return { country: geo?.country || null, countryCode: geo?.countryCode || null, benchmark };
}

// ── Real P2P transfers from the block's other transactions ──────────────────

/*
 * Every non-coinbase transaction in the block, with its real sender and
 * recipient(s) — the sender is the first input's address, and a recipient is
 * any output address that isn't the sender's own (excluding typical
 * change-back-to-self outputs). This is real per-transaction data, not a
 * derived count: we already fetch the full transaction list to get the
 * coinbase, so this comes from the same call.
 *
 * In practice this often comes back empty: most of a block's non-coinbase
 * transactions are "Confirming a fluxnode" specials (see
 * buildConfirmationEvents above) — a genuine transparent send/receive tx has
 * vin/vout at all, a confirming tx has neither, so this naturally skips them
 * rather than misreading them as transfers. Verified live against the
 * current chain: several consecutive real blocks and the live mempool were
 * 100% confirmations with zero non-confirmation transactions — a real P2P
 * transfer is much rarer than block activity in general, not a sign this is
 * broken when the section is empty.
 */
export function extractP2pTransfers(otherTxs) {
  const transfers = [];
  for (const tx of otherTxs || []) {
    const from = tx?.vin?.[0]?.addr || null;
    for (const vout of tx?.vout || []) {
      const address = vout.scriptPubKey?.addresses?.[0];
      const amount = Number(vout.value);
      if (!address || !amount || address === from) continue; // skip change-back-to-self
      transfers.push({ id: `p2p-${tx.txid}-${address}`, type: 'p2p', txid: tx.txid, from, to: address, amount });
    }
  }
  return transfers;
}

// ── Deployments (already real, from the existing app-specs fetch) ───────────

/*
 * Given the previous and current "Deployed Today" lists (from the existing
 * fetch_global_app_specs, already block-height-driven and real), returns
 * events for specs that are newly present. Always labeled a deployment, never
 * a payment — Flux apps pay upfront for a hosting duration, they are not paid
 * per block the way node tiers are.
 *
 * `attributionHeight` (typically the current chain tip at the moment this
 * poll ran) is what the event is actually filed under — NOT the app's own
 * real deploy height (spec.height, kept separately as deployedAtHeight).
 * Deployed-today is checked on a slow ~5-minute cycle covering the last 24h
 * of network-wide deployments, so a real deploy's own height almost never
 * lands inside the ~5 blocks (~2.5 minutes) the chain rail actually shows —
 * filed under its true height, a "new" deploy would be correctly detected
 * but silently attached to a block nobody's looking at. Attributing to "the
 * block we happened to notice it at" is what actually makes it visible,
 * without changing what's true (deployedAtHeight is preserved for anyone
 * who wants the real number).
 */
export function diffDeployedForEvents(prevDeployedToday, nextDeployedToday, attributionHeight) {
  const prevKeys = new Set((prevDeployedToday || []).map((s) => `${s.name}-${s.height}`));
  const events = [];

  for (const spec of nextDeployedToday || []) {
    const key = `${spec.name}-${spec.height}`;
    if (prevKeys.has(key)) continue;

    events.push({
      id: `deploy-${key}`,
      type: 'deploy',
      appName: spec.name,
      category: spec.category,
      blockHeight: attributionHeight ?? spec.height,
      deployedAtHeight: spec.height,
      instances: spec.instances,
      cpuPerInst: spec.cpuPerInst,
      ramGBPerInst: spec.ramGBPerInst,
      ssdGBPerInst: spec.ssdGBPerInst,
      owner: spec.owner,
      description: spec.description || null,
      expireBlocks: spec.expire || null,
      repos: composeRepos(spec),
      at: Date.now(),
    });
  }

  return events;
}

// Apps carry either a multi-component `compose` array (each with its own
// `repotag`) or, on legacy specs, a single top-level `repotag`.
function composeRepos(spec) {
  if (Array.isArray(spec.compose) && spec.compose.length > 0) {
    return spec.compose.map((c) => c.repotag).filter(Boolean);
  }
  return spec.repotag ? [spec.repotag] : [];
}

// Attaches accumulated events (keyed by block height) onto each fetched
// block. Pure — eventsByHeight is supplied by the caller, which owns
// accumulating events across polls.
export function attachEventsToBlocks(blocks, eventsByHeight) {
  return (blocks || []).map((block) => ({ ...block, events: eventsByHeight?.[block.height] || [] }));
}
