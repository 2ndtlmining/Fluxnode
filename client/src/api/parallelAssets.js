/*
 * Extracted from apidata.js (issue #147). This is a MOVE, not a rewrite: the
 * code below is unchanged, and apidata.js re-exports it, so no call site
 * changes in this pass.
 */

/*
 * Parallel assets: a wallet's holdings and claimable amounts across the chains
 * Flux is bridged to.
 *
 * Self-contained -- its helpers (single_pa_info, fetch_fusion_fees,
 * fetch_wallet_pas) are all internal and used nowhere else, which is why this
 * block moved without touching anything around it.
 *
 * Note for later: the v9 whitepaper retires eight of the ten parallel-asset
 * chains between March and August 2027, and the mining allocation is exhausted
 * at block 3,787,502 (issue #205). This module is where that lands.
 */

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


/*
 * Performance rankings moved to api/rankings.js (issue #147). Re-exported
 * here so no call site changes in this pass; importers migrate to the new
 * path incrementally, and this barrel goes away once none are left.
 */
