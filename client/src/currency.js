// Currency rates for the value display, kept in its own module so it can be
// unit tested without importing the rest of apidata.js.

import { appStore, StoreKeys } from 'persistance/store';

const CURRENCY_RATE_TTL_MS = 60 * 60 * 1000; // 1 hour

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest';

/*
 * Every rate is quoted against USD, because all prices in the app originate as
 * flux_price_usd and are rendered as `flux_price_usd * selectedCurrency.rate`.
 */
export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'AUD', 'GBP'];

/**
 * A cache is only usable if it is recent AND covers every supported currency.
 * Without the second check, adding a currency leaves it invisible for up to an
 * hour after deploy for anyone with a warm cache.
 */
export function isCacheUsable(cached, now = Date.now()) {
  if (!cached?.rates || !cached?.timestamp) return false;
  if (now - cached.timestamp >= CURRENCY_RATE_TTL_MS) return false;
  return SUPPORTED_CURRENCIES.every((c) => c in cached.rates);
}

/**
 * Frankfurter omits the base currency from its response, so USD is added here
 * at exactly 1.
 *
 * This used to come from a second request — `latest?to=USD` with no base.
 * Frankfurter defaults the base to EUR, so that returned USD *per EUR* (1.1662
 * at time of writing) rather than 1. Selecting USD in the currency menu
 * therefore multiplied every USD figure by 1.17: wallet value, earnings
 * projections and Flux price were all ~17% too high for anyone who had
 * explicitly chosen USD. The default { currency: 'USD', rate: 1 } in
 * LayoutContext was correct, which is why it went unnoticed.
 */
export function buildRates(apiRates) {
  // USD last so it always wins, even if a future API response includes it.
  return { ...(apiRates || {}), USD: 1 };
}

export async function lazy_load_currency_rate() {
  const cached = await appStore.getItem(StoreKeys.CURRENCY_RATES);
  if (isCacheUsable(cached)) return cached.rates;

  try {
    const res = await fetch(`${FRANKFURTER_URL}?to=${SUPPORTED_CURRENCIES.join(',')}&base=USD`);
    if (!res.ok) return cached?.rates ?? null;

    const json = await res.json();
    const currencies = buildRates(json?.rates);

    await appStore.setItem(StoreKeys.CURRENCY_RATES, { rates: currencies, timestamp: Date.now() });
    return currencies;
  } catch (error) {
    console.log(error);
    // Return stale data if available rather than nothing
    if (cached?.rates) return cached.rates;
  }
  return null;
}
