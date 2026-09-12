/*
 * Re-export barrel for the API layer (issue #147).
 *
 * This file was 1,702 lines owning the global store, wallet lookup, node
 * transformation, currency, parallel assets, rankings, app specs, geolocation,
 * GPU pricing and DOS state. That grab-bag caused real bugs: duplicated
 * resource maths fixed in one place and not the other, and the same 465 KB
 * endpoint fetched twice inside one Promise.all because the two callers were
 * sixty lines apart in a file nobody read end to end.
 *
 * It now holds no logic at all -- only re-exports, so that existing
 * `from 'apidata'` imports keep working. Call sites migrate to the real module
 * paths incrementally, and this file goes away once none are left.
 *
 * New code should import from the owning module directly:
 *
 *   api/globalStats.js    the global store and the fetches that fill it
 *   api/walletNodes.js    a wallet's nodes, raw record -> table row, DOS state
 *   api/rankings.js       network-wide performance rankings
 *   api/specs.js          global application specifications
 *   api/parallelAssets.js parallel-asset holdings and claimables
 *   api/gpuPrices.js      GPU pricing and fleet totals
 *   api/endpoints.js      paths and request options shared between the above
 *   currency.js           currency rates
 */

export { lazy_load_currency_rate, SUPPORTED_CURRENCIES } from 'currency';

export {
  tier_global_projections,
  create_global_store,
  fill_rewards,
  fetch_total_donations,
  fetch_donation_totals,
  fetch_wallet_donation_summary,
  fetch_arcane_os_stats,
  fetch_total_network_utils,
  fetch_global_stats
} from 'api/globalStats';

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
  isWalletDOSState
} from 'api/walletNodes';

export {
  buildTierResolver,
  fetch_global_performance_rankings,
  fetch_country_node_counts,
  _extract_country_counts
} from 'api/rankings';

export { pa_summary_full, wallet_pas_summary } from 'api/parallelAssets';
export { fetch_global_app_specs, fetch_global_app_specs_raw } from 'api/specs';
export { fetch_gpu_prices } from 'api/gpuPrices';
