import { extractRewardsFromCoinbase } from 'live/apidata';

/*
 * A block, reduced to one particle per event (issue #292).
 *
 * WHAT A FLUX BLOCK ACTUALLY CONTAINS -- measured over 200 live blocks while
 * designing this, because it decides everything about how the thing should
 * look:
 *
 *     txlength   median 13, p90 17, p99 65, max 214, none above 500
 *     per block  exactly 4 rewards, then 7-14 confirmations
 *     p2p        ZERO in all ten blocks decomposed in detail
 *
 * So a typical block is ~15 particles, dominated by confirmations, and the
 * 500 cap is a guard against something pathological rather than a routine
 * path. Blocks look broadly alike; the life comes from the count breathing
 * between 8 and 17 and from the occasional 65+ block, not from dramatic
 * differences.
 *
 * ONE ENDPOINT, THREE CATEGORIES. The split comes entirely from
 * /txs/?block=<hash>, with no second endpoint, because a node transaction
 * announces itself: it carries `ip`, `benchmarkTier` and `updateType`, and has
 * no transparent inputs or outputs whatsoever. Anything with real outputs to
 * an address that is not the sender is a transfer.
 *
 * This is NOT the same as "a node paying itself", which is what it looks like
 * from the money alone and which was the first attempt -- measured against
 * live data, those transactions move no transparent value at all, so that test
 * classified every one of them as a transfer-with-no-recipients and silently
 * dropped ~10 events per block.
 *
 * Deployments are deliberately absent. /live attributes them to whichever
 * block a poll happened to notice them at rather than their real height (see
 * diffDeployedForEvents), so they are the one category that is not literal,
 * and they would need a second slow poll Home does not otherwise make.
 */

export const PARTICLE_CAP = 500;

/*
 * A node transaction -- a confirmation, collateral update or benchmark report.
 *
 * Identified by its own fields rather than by inferring from the money, which
 * is what the first attempt got wrong. These transactions carry NO transparent
 * inputs or outputs at all (`vin: []`, `vout: []`); what they carry instead is
 * `ip`, `benchmarkTier`, `updateType` and `collateralOutput`. Checked against
 * live data: all 9 non-coinbase transactions in block 2,945,979 were this
 * shape, none had a single transparent output between them.
 *
 * The empty-vin-and-vout fallback covers node transaction types whose specific
 * fields differ; nothing on this chain has no transparent movement AND is a
 * transfer.
 */
function isNodeTransaction(tx) {
  if (tx?.updateType || tx?.benchmarkTier || tx?.benchmark_tier || tx?.collateralOutput) return true;
  const vin = Array.isArray(tx?.vin) ? tx.vin : [];
  const vout = Array.isArray(tx?.vout) ? tx.vout : [];
  return vin.length === 0 && vout.length === 0;
}

function transferParticles(tx) {
  const from = tx?.vin?.[0]?.addr || null;
  const out = [];
  (tx?.vout || []).forEach((vout, i) => {
    const address = vout?.scriptPubKey?.addresses?.[0];
    const amount = Number(vout?.value);
    // Change back to the sender is not a payment to anybody.
    if (!address || !amount || address === from) return;
    out.push({ key: `p2p-${tx.txid}-${i}`, kind: 'p2p', category: 'P2P' });
  });
  return out;
}

/**
 * @returns {{
 *   particles: Array<{key: string, kind: 'reward'|'confirm'|'p2p', category: string}>,
 *   counts: {reward: number, confirm: number, p2p: number},
 *   total: number, capped: boolean, hidden: number
 * }}
 *
 * `category` is a key of live/categoryMeta.js's CATEGORY_META, so the colours
 * come from the same table /live uses and the two surfaces cannot drift on
 * what a colour means.
 */
export function composeBlock(blockTxs, { cap = PARTICLE_CAP } = {}) {
  const txs = Array.isArray(blockTxs?.txs) ? blockTxs.txs : [];

  const rewards = [];
  const confirms = [];
  const transfers = [];

  for (const tx of txs) {
    if (tx?.isCoinBase) {
      extractRewardsFromCoinbase(tx).forEach((r, i) => {
        rewards.push({ key: `reward-${tx.txid}-${i}`, kind: 'reward', category: r.tier });
      });
      continue;
    }

    if (isNodeTransaction(tx)) {
      confirms.push({ key: `confirm-${tx.txid}`, kind: 'confirm', category: 'CONFIRM' });
      continue;
    }

    transfers.push(...transferParticles(tx));
  }

  const total = rewards.length + confirms.length + transfers.length;

  /*
   * Rewards are never dropped. There are only ever four, and they are the only
   * particles that identify a tier -- losing one to make room for a
   * confirmation would trade the block's most meaningful colour for its least.
   * The cap trims the bulk categories instead, and the TRUE total is still
   * reported: this is a rendering limit, not a claim about the chain.
   */
  let particles = [...rewards, ...confirms, ...transfers];
  let capped = false;

  if (particles.length > cap) {
    const room = Math.max(0, cap - rewards.length);
    const bulk = [...confirms, ...transfers];
    particles = [...rewards, ...bulk.slice(0, room)];
    capped = true;
  }

  return {
    particles,
    counts: { reward: rewards.length, confirm: confirms.length, p2p: transfers.length },
    total,
    capped,
    hidden: total - particles.length,
  };
}
