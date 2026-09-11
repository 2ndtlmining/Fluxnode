/*
 * Which donation chip to show for the wallet currently being viewed
 * (issue #258).
 *
 * Deliberately NOT the donor-benefit rule. donorStatus.js's 10-FLUX/365-day
 * threshold decides who gets premium features; this decides who gets thanked,
 * and those should not be the same bar. Telling somebody who donated 5 FLUX
 * last month that they have not donated is worse than saying nothing at all.
 *
 * 'hidden' covers three different situations on purpose -- no wallet, still
 * checking, and check failed -- because the correct rendering for all three is
 * the same: nothing. Asking a real donor for a donation because the explorer
 * returned 429 is the one outcome worth engineering against here.
 */
export function walletDonationState({ address, donationCount, settled, failed } = {}) {
  if (!address) return 'hidden';

  // An acknowledgement already earned is never retracted by a later failure.
  if (typeof donationCount === 'number' && donationCount > 0) return 'supporter';

  if (!settled || failed) return 'hidden';

  return 'ask';
}
