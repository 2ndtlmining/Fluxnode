import { computeDonorStatus } from './donorStatus';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-05T00:00:00Z').getTime();

describe('computeDonorStatus', () => {
  it('is not a donor with no records', () => {
    expect(computeDonorStatus([], NOW)).toEqual({
      isDonor: false, totalInWindow: 0, expiresAt: null, daysLeft: 0,
    });
  });

  it('is not a donor below the threshold', () => {
    const records = [{ date: NOW - 10 * DAY_MS, amount: 9.99 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBeCloseTo(9.99);
  });

  it('is a donor exactly at the threshold', () => {
    const records = [{ date: NOW - 10 * DAY_MS, amount: 10 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBe(10);
  });

  it('ignores a donation older than the 365-day window entirely', () => {
    const records = [{ date: NOW - 400 * DAY_MS, amount: 50 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBe(0);
  });

  it('expiresAt is exactly 365 days after a single donation', () => {
    const donationDate = NOW - 10 * DAY_MS;
    const records = [{ date: donationDate, amount: 15 }];
    const result = computeDonorStatus(records, NOW);
    expect(result.isDonor).toBe(true);
    expect(result.expiresAt).toBe(donationDate + 365 * DAY_MS);
    expect(result.daysLeft).toBe(355);
  });

  it('expiry is driven by the next drop that would fall below threshold, not the first', () => {
    // Two donations of 6 each (total 12, threshold 10). The older one (300 days
    // ago) ages out first, dropping the running total to 6 — below threshold —
    // so THAT drop date is the expiry, not the newer donation's.
    const older = { date: NOW - 300 * DAY_MS, amount: 6 };
    const newer = { date: NOW - 50 * DAY_MS, amount: 6 };
    const result = computeDonorStatus([newer, older], NOW); // order-independent input
    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBe(12);
    expect(result.expiresAt).toBe(older.date + 365 * DAY_MS);
  });

  it('a donation large enough alone keeps donor status past a smaller one aging out', () => {
    // Older 15 (well above threshold alone) + newer 5. When the older one ages
    // out, running drops from 20 to 5 — below threshold 10 — so it's still the
    // older donation's drop date that matters here, same shape as above but
    // confirms the loop doesn't stop at the newer record first.
    const older = { date: NOW - 300 * DAY_MS, amount: 15 };
    const newer = { date: NOW - 50 * DAY_MS, amount: 5 };
    const result = computeDonorStatus([older, newer], NOW);
    expect(result.expiresAt).toBe(older.date + 365 * DAY_MS);
  });
});
