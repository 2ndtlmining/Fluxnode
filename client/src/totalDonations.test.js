import { fetch_total_donations } from './apidata';
import { OLD_ADDRESS_FLUX } from 'donor/config';

/*
 * Track 3 (calculation-correctness audit), domain D3.
 *
 * fetch_total_donations had ZERO test coverage, which is exactly why this bug
 * survived a green suite for over a week. It scanned only
 * window.gContent.ADDRESS_FLUX, while donor/donorStatus.js:166 -- fixed in
 * PR #196 -- correctly iterates [ADDRESS_FLUX, OLD_ADDRESS_FLUX].
 *
 * The donation address changed 2026-09-03, so every donation made before that
 * date was invisible here. That is not only a wrong "total donations" figure on
 * Home/MainApp: the value feeds main/Gamification/achievements.js, where
 * `donor` (>= 1), `super_donor` (>= 5) and `sugar_daddy` (>= 50) are gated on
 * it. Early supporters were being silently denied achievements they had
 * already earned, while donorStatus.js still granted them premium access --
 * an asymmetry that made the bug easy to miss.
 *
 * The function returns a COUNT of donation transactions, not a FLUX sum. The
 * achievement labels ("N / 5 donations") agree.
 */

const CURRENT_ADDRESS = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const DONOR_WALLET = 't1DonorWalletAddressForTest';

// One explorer "txs?address=" page. `vin[].addr` is the sender, which is what
// fetch_total_donations filters on.
function page(txids, sender = DONOR_WALLET) {
  return {
    pagesTotal: 1,
    txs: txids.map((txid) => ({ txid, vin: [{ addr: sender }] })),
  };
}

function mockExplorer(byAddress) {
  global.fetch = jest.fn((url) => {
    const address = Object.keys(byAddress).find((a) => url.includes(a));
    const body = address ? byAddress[address] : { pagesTotal: 1, txs: [] };
    return Promise.resolve({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(body),
    });
  });
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('fetch_total_donations', () => {
  it('counts donations made to the CURRENT address', async () => {
    mockExplorer({ [CURRENT_ADDRESS]: page(['a', 'b']) });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(2);
  });

  it('counts donations made to the OLD address too', async () => {
    // The regression: an early supporter whose donations all predate the
    // 2026-09-03 address change. Before the fix this resolved to 0, costing
    // them the `donor` achievement outright.
    mockExplorer({
      [CURRENT_ADDRESS]: page([]),
      [OLD_ADDRESS_FLUX]: page(['old1', 'old2', 'old3']),
    });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(3);
  });

  it('sums donations across both addresses', async () => {
    mockExplorer({
      [CURRENT_ADDRESS]: page(['new1']),
      [OLD_ADDRESS_FLUX]: page(['old1', 'old2']),
    });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(3);
  });

  it('does not double-count a txid that appears under both addresses', async () => {
    // A single transaction paying both addresses would otherwise be counted
    // twice once the second scan is added.
    mockExplorer({
      [CURRENT_ADDRESS]: page(['shared', 'new1']),
      [OLD_ADDRESS_FLUX]: page(['shared']),
    });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(2);
  });

  it('ignores transactions sent by a different wallet', async () => {
    mockExplorer({
      [CURRENT_ADDRESS]: page(['x'], 't1SomeoneElse'),
      [OLD_ADDRESS_FLUX]: page(['y'], 't1SomeoneElse'),
    });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(0);
  });

  it('still counts the reachable address when the other scan fails', async () => {
    // Fails soft rather than resolving 0 for everyone: one address being
    // unreachable must not erase donations proven against the other.
    global.fetch = jest.fn((url) => {
      if (url.includes(OLD_ADDRESS_FLUX)) return Promise.reject(new Error('explorer down'));
      return Promise.resolve({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(page(['new1', 'new2'])),
      });
    });
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(2);
  });

  it('resolves 0 rather than throwing when the explorer is unavailable', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('explorer down')));
    await expect(fetch_total_donations(DONOR_WALLET)).resolves.toBe(0);
  });
});
