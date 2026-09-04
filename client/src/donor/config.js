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
 * is built: DonorContext verifies a wallet's real on-chain donations via
 * fetch_donor_status and gates premium features (currently just /live) on
 * the result. This flag is a dev/QA override that sits ON TOP OF that real
 * verification, not a replacement for it — DonorContext's `isUnlocked` is
 * `isPremiumTestingUnlocked() || donorStatus?.isDonor`, so flipping this on
 * unlocks premium features without needing a real donor wallet, while real
 * users are still gated by actual verified donations when it's off.
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
