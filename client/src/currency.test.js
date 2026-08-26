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

describe('lazy_load_currency_rate — failure behaviour', () => {
  const { appStore } = require('persistance/store');
  const { lazy_load_currency_rate } = require('./currency');

  beforeEach(() => {
    jest.clearAllMocks();
    appStore.getItem.mockReset();
    appStore.setItem.mockReset();
  });

  it('calls the .dev host, not the .app host that 301s without CORS headers', async () => {
    appStore.getItem.mockResolvedValue(null);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.857, AUD: 1.39, GBP: 0.734 } }),
    });

    await lazy_load_currency_rate();

    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('api.frankfurter.dev');
    expect(url).not.toContain('api.frankfurter.app');
    expect(url).toContain('base=USD');
  });

  it('never returns null — a failed fetch must not collapse the menu to USD only', async () => {
    appStore.getItem.mockResolvedValue(null);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const rates = await lazy_load_currency_rate();

    expect(rates).not.toBeNull();
    expect(rates.USD).toBe(1);
  });

  it('prefers stale cached rates over the bare USD fallback', async () => {
    appStore.getItem.mockResolvedValue({
      rates: { USD: 1, EUR: 0.9, AUD: 1.4, GBP: 0.75 },
      timestamp: 0, // long expired
    });
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const rates = await lazy_load_currency_rate();

    expect(Object.keys(rates).sort()).toEqual(['AUD', 'EUR', 'GBP', 'USD']);
  });

  it('survives storage being unavailable', async () => {
    // private browsing / storage disabled: getItem rejects
    appStore.getItem.mockRejectedValue(new Error('IndexedDB unavailable'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { EUR: 0.857 } }),
    });

    const rates = await lazy_load_currency_rate();

    expect(rates.USD).toBe(1);
    expect(rates.EUR).toBe(0.857);
  });
});
