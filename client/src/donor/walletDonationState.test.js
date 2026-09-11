import { walletDonationState } from './walletDonationState';

/*
 * Issue #258 -- the per-wallet chip next to "Current Wallet Address".
 *
 * Three states, and the third is the whole point: showing "support development"
 * to somebody who HAS donated, because the explorer happened to fail, is the
 * one genuinely bad outcome here. Silence is always safe; a wrong ask is not.
 */
describe('walletDonationState', () => {
  it('thanks a wallet that has donated', () => {
    expect(walletDonationState({ address: 't1alice', donationCount: 1, settled: true })).toBe('supporter');
  });

  it('treats ANY donation as support, not just one over the donor threshold', () => {
    // The 10-FLUX/365-day rule gates PREMIUM. Telling somebody who gave 5 FLUX
    // last month that they have not donated would be worse than saying nothing.
    expect(walletDonationState({ address: 't1alice', donationCount: 1, settled: true })).toBe('supporter');
  });

  it('asks a wallet that has never donated', () => {
    expect(walletDonationState({ address: 't1bob', donationCount: 0, settled: true })).toBe('ask');
  });

  it('shows nothing while the check is still running', () => {
    expect(walletDonationState({ address: 't1bob', donationCount: 0, settled: false })).toBe('hidden');
  });

  it('shows nothing when the check FAILED rather than asking a possible donor', () => {
    expect(walletDonationState({ address: 't1bob', donationCount: 0, settled: true, failed: true })).toBe('hidden');
  });

  it('still thanks a known donor even if a later refresh failed', () => {
    // A failed refresh must not retract an acknowledgement already earned.
    expect(walletDonationState({ address: 't1alice', donationCount: 3, settled: true, failed: true })).toBe('supporter');
  });

  it('shows nothing when no wallet is being viewed', () => {
    expect(walletDonationState({ address: null, donationCount: 0, settled: true })).toBe('hidden');
    expect(walletDonationState({ address: '', donationCount: 0, settled: true })).toBe('hidden');
  });

  it('treats a missing count as not-yet-known rather than zero', () => {
    expect(walletDonationState({ address: 't1bob', settled: false })).toBe('hidden');
  });

  it('survives being called with nothing', () => {
    expect(walletDonationState()).toBe('hidden');
  });
});
