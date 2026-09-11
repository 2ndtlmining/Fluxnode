/*
 * Known Flux addresses: exchange deposit addresses, and the Flux Foundation.
 *
 * Source: 2ndtlmining/fluxflow, src/lib/data/exchanges.json, fetched
 * 2026-09-11. Kept as a checked-in copy rather than fetched at runtime -- it
 * changes rarely, a network dependency here would mean a rate limit could
 * silently downgrade every label to "unknown", and a wrong label is worse than
 * no label.
 *
 * Note for whoever updates this: todo.md previously recorded that no reliable
 * public source of Flux exchange addresses existed. That was wrong -- this
 * list is maintained in fluxflow. Re-check there before concluding otherwise.
 *
 * Verified at import time: the exchange and foundation sets do not overlap, so
 * an address resolves to exactly one label.
 */

export const EXCHANGES = [
  { name: 'Coinex', addresses: ['t1bLYKTWBMUSAhrU2ezDEzC2BXYbafz5L9e'] },
  { name: 'GateIO', addresses: ['t1YvimnGBmVA7xDiPnqwbKsvujmSJz4X5m2'] },
  { name: 'Kucoin', addresses: ['t1g7QCktktwReoHgwWtAgNBVvzzboQVZy19', 't1gorwQHhWsvfgSEE3YzBZFnyewfGaimUbF', 't1bVAMF4KUxcyVZa3X3sPB4Tx5jmdgS876X'] },
  { name: 'NonKYC', addresses: ['t1LXVRNWEugRtoWdNgxnozCBGksGtCvvWsy', 't1eELWS8QBkhRfEF2LBZnxKwCQaWvZ8j8hU'] },
];

export const FOUNDATION = {
  name: 'Flux Foundation',
  addresses: [
    't3c51GjrkUg7pUiS8bzNdTnW2hD25egWUih',
    't3ZQQsd8hJNw6UQKYLwfofdL3ntPmgkwofH',
    't3XjYMBvwxnXVv9jqg4CgokZ3f7kAoXPQL8',
    't1XWTigDqS5Dy9McwQc752ShtZV1ffTMJB3',
    't1eabPBaLCqNgttQMnAoohPaQM6u2vFwTNJ',
    't3PMbbA5YBMrjSD3dD16SSdXKuKovwmj6tS',
    't1abAp9oZenibGLFuZKyUjmL6FiATTaCYaj',
    't1cjcLaDHkNcuXh6uoyNL7u1jx7GxvzfYAN',
    't3ThbWogDoAjGuS6DEnmN1GWJBRbVjSUK4T',
    't3heoBJT9gn9mne7Q5aynajJo7tReyDv2NV',
    't1ZLpyVr6hs3vAH7qKujJRpu17G3VdxAkrY',
    't1SHUuYiE8UT7Hnu9Qr3QcGu3W4L55W98pU',
    't1Yum7okNzR5kW84dfgwqB23yy1BCcpHFPq',
    't1Zj9vUsAMoG4M9LSy5ahDzZUmokKGXqwcT',
    't3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ',
    't1PGMqZxGPzPQcpJKWVyLc4c9D7SvjVe4kq',
    't1enVJqsiqRxpdnQw3f6Zwp1jAk9e3Wj9n2',
  ],
};

// Flat lookup built once at module load: an address history can be thousands
// of transactions, and a linear scan per output would be needlessly quadratic.
const ADDRESS_INDEX = new Map();
for (const exchange of EXCHANGES) {
  for (const address of exchange.addresses) {
    ADDRESS_INDEX.set(address, { kind: 'exchange', name: exchange.name });
  }
}
for (const address of FOUNDATION.addresses) {
  ADDRESS_INDEX.set(address, { kind: 'foundation', name: FOUNDATION.name });
}

/**
 * Identify a Flux address, or null when it is not one we know.
 * @returns {{kind: 'exchange'|'foundation', name: string}|null}
 */
export function lookupAddress(address) {
  if (!address) return null;
  return ADDRESS_INDEX.get(address) || null;
}
