// Sum of FLUX a wallet must have sent to ADDRESS_FLUX within DONOR_WINDOW_DAYS to
// qualify as a donor. Tunable — not hardcoded inline anywhere else.
export const DONOR_THRESHOLD_FLUX = 10;
export const DONOR_WINDOW_DAYS = 365;

// How long a verified donor-status result is trusted before fetch_donor_status
// re-checks the chain, matching fluxinfo.js's cache TTL convention.
export const DONOR_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Safety cap on explorer API pages fetched per check, for wallets whose donation
// address has an unusually long transaction history.
export const DONOR_MAX_PAGES_FETCHED = 20;

/*
 * The full donor-gate mechanism (wallet -> chain-donation check -> unlock)
 * is specced in PREMIUM_FEATURES_PLAN.md but not built yet. Until it is,
 * this flag is the ONLY way premium features (currently just /live) unlock
 * — real users see the locked state unconditionally.
 *
 * Set via the PREMIUM_TESTING_MODE Docker environment variable at container
 * start (see service/container-entrypoint.sh, which patches this value into
 * public/runtime/app-content.js before nginx serves it — no rebuild needed).
 * For local `yarn start` testing, flip the value directly in
 * client/public/runtime/app-content.js instead.
 */
export function isPremiumTestingUnlocked() {
  return window.gContent?.PREMIUM_TESTING_MODE === true;
}
