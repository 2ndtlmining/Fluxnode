// Sum of FLUX a wallet must have sent to ADDRESS_FLUX (or OLD_ADDRESS_FLUX,
// see below) within DONOR_WINDOW_DAYS to qualify as a donor. Tunable — not
// hardcoded inline anywhere else.
export const DONOR_THRESHOLD_FLUX = 10;
export const DONOR_WINDOW_DAYS = 365;

// How long a verified donor-status result is trusted before fetch_donor_status
// re-checks the chain, matching fluxinfo.js's cache TTL convention.
export const DONOR_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Safety cap on explorer API pages fetched per check, for wallets whose donation
// address has an unusually long transaction history.
export const DONOR_MAX_PAGES_FETCHED = 20;

/*
 * The project's donation address changed on 2026-09-03 (commit c02f781,
 * bundled silently into an unrelated "remove Guides page" commit — the old
 * address was t1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG, current is
 * content/index.js's ADDRESS_FLUX). Anyone who donated before the switch
 * would otherwise get zero credit today. fetch_donor_status checks both
 * addresses and sums matching donations from either — checked indefinitely,
 * with no cutoff date, since it costs nothing to keep recognizing it and a
 * date cutoff is one more thing to get wrong for no real benefit (nobody
 * should be sending here anymore, but if they mistakenly do, there's no
 * reason to penalize them for it either).
 *
 * Checked live 2026-09-10 against explorer.runonflux.io: this address's
 * ENTIRE transaction history is 18 pages — comfortably under
 * DONOR_MAX_PAGES_FETCHED (20) — so a scan of it always completes cleanly
 * (either by reaching the window edge, or by exhausting all 18 real pages)
 * rather than hitting the page cap and reporting `scanComplete: false` on
 * every single check. Since this address stopped receiving new donations
 * on the 2026-09-03 switch, its page count is effectively frozen going
 * forward — this isn't a risk that grows over time. Re-check this figure
 * only if `DONOR_MAX_PAGES_FETCHED` itself is ever lowered.
 */
export const OLD_ADDRESS_FLUX = 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG';

/*
 * The full donor-gate mechanism (wallet -> chain-donation check -> unlock)
 * is built: DonorContext verifies a wallet's real on-chain donations via
 * fetch_donor_status and gates premium features (currently just /live) on
 * the result. This flag is a dev/QA override that sits ON TOP OF that real
 * verification, not a replacement for it — DonorContext's `isUnlocked` is
 * `isTestingUnlocked() || donorStatus?.isDonor`, so flipping this on
 * unlocks premium features without needing a real donor wallet, while real
 * users are still gated by actual verified donations when it's off.
 *
 * Set via the TESTING Docker environment variable at container
 * start (see service/container-entrypoint.sh, which patches this value into
 * public/runtime/app-content.js before nginx serves it — no rebuild needed).
 * For local `yarn start` testing, flip the value directly in
 * client/public/runtime/app-content.js instead.
 */
export function isTestingUnlocked() {
  return window.gContent?.TESTING === true;
}
