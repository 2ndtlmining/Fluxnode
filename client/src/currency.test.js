/*
 * persistance/store does `import * as localforage` — a namespace import of a CJS
 * module that webpack tolerates but Jest does not, so importing it here throws
 * before any test runs. The functions under test are pure and never touch the
 * store, so it is stubbed. Fixing the interop properly is part of #147.
 */
jest.mock('persistance/store', () => ({
  appStore: { getItem: jest.fn(), setItem: jest.fn() },
  StoreKeys: { CURRENCY_RATES: 'currencyRates' },
}));

import { buildRates, isCacheUsable, SUPPORTED_CURRENCIES } from './currency';

/*
 * These pin a live money bug: the USD rate used to be fetched from
 * `frankfurter.app/latest?to=USD` with no base. Frankfurter defaults the base
 * to EUR, so that call returns USD *per EUR* — 1.1662 when this was found —
 * and selecting USD in the currency menu inflated every USD figure by ~17%.
 */

describe('buildRates', () => {
  it('pins USD at exactly 1', () => {
    // Frankfurter omits the base currency, so a base=USD response has no USD key
    const apiRates = { EUR: 0.85749, AUD: 1.398, GBP: 0.73358 };
    expect(buildRates(apiRates).USD).toBe(1);
  });

  it('never lets the API supply a USD rate other than 1', () => {
    // The shape of the old bug: a USD-per-EUR value leaking into the rate table.
    // Even if a future response carries a USD key, it must not survive.
    expect(buildRates({ USD: 1.1662, EUR: 0.85749 }).USD).toBe(1);
    expect(buildRates({ EUR: 0.85749 }).USD).toBe(1);
  });

  it('passes the other currencies through untouched', () => {
    const rates = buildRates({ EUR: 0.85749, AUD: 1.398, GBP: 0.73358 });
    expect(rates).toEqual({ USD: 1, EUR: 0.85749, AUD: 1.398, GBP: 0.73358 });
  });

  it('survives a missing or malformed response', () => {
    expect(buildRates(undefined)).toEqual({ USD: 1 });
    expect(buildRates(null)).toEqual({ USD: 1 });
  });

  it('converts a USD price correctly for every supported currency', () => {
    const rates = buildRates({ EUR: 0.85749, AUD: 1.398, GBP: 0.73358 });
    const fluxPriceUsd = 0.0434;
    expect(fluxPriceUsd * rates.USD).toBeCloseTo(0.0434, 6);
    expect(fluxPriceUsd * rates.GBP).toBeCloseTo(0.031837, 6);
  });
});

describe('SUPPORTED_CURRENCIES', () => {
  it('includes GBP', () => {
    expect(SUPPORTED_CURRENCIES).toContain('GBP');
  });

  it('leads with USD, the base every rate is quoted against', () => {
    expect(SUPPORTED_CURRENCIES[0]).toBe('USD');
  });
});

describe('isCacheUsable', () => {
  const fresh = { rates: { USD: 1, EUR: 0.86, AUD: 1.4, GBP: 0.73 }, timestamp: 1000 };
  const now = 1000 + 60 * 1000; // one minute later

  it('accepts a recent cache covering every supported currency', () => {
    expect(isCacheUsable(fresh, now)).toBe(true);
  });

  it('rejects a cache missing a newly added currency, however recent', () => {
    // Exactly the GBP rollout case: a warm cache written before GBP existed
    const preGbp = { rates: { USD: 1, EUR: 0.86, AUD: 1.4 }, timestamp: 1000 };
    expect(isCacheUsable(preGbp, now)).toBe(false);
  });

  it('rejects a cache older than the TTL', () => {
    expect(isCacheUsable(fresh, 1000 + 61 * 60 * 1000)).toBe(false);
  });

  it('rejects empty, partial and malformed caches', () => {
    expect(isCacheUsable(null, now)).toBe(false);
    expect(isCacheUsable({}, now)).toBe(false);
    expect(isCacheUsable({ rates: { USD: 1 } }, now)).toBe(false);
    expect(isCacheUsable({ timestamp: 1000 }, now)).toBe(false);
  });
});
