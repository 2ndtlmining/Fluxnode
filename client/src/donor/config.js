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
