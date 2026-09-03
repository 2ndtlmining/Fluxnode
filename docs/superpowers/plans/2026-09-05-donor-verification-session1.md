# Donor Verification (Part B, Session 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the testing-only donor gate (PR #165 — `isUnlocked` driven solely by the
`PREMIUM_TESTING_MODE` flag, `donorWallet` hardcoded `null`) with real donor verification:
a visitor enters a wallet address, the app checks it against public chain data, and a
qualifying wallet unlocks premium features for real.

**Architecture:** A pure, network-free algorithm (`computeDonorStatus`) decides
donor status from a list of `{date, amount}` records — fully unit-testable without
mocking `fetch`. A thin fetch/parse layer (`fetch_donor_status`) turns a wallet address
into that record list by paginating the existing public explorer API, with its own
localStorage cache. `DonorContext` (already built, currently a stub) gets wired to call
`fetch_donor_status` for real. A new `DonorUnlockDialog` is the only place a wallet
address is entered; `PremiumGate` (already built) gets a button that opens it. A new
`DonorBadge` surfaces status on Home and Nodes.

**Tech Stack:** React 18 (hooks, function components), Blueprint.js (`Dialog`,
`InputGroup`, `Button`, `Spinner`), Jest (existing test runner, no new dependency).

**Spec:** `PREMIUM_FEATURES_PLAN.md` (repo root), Part B and the "Build order" section's
Session 1 entry.

## Global Constraints

- **Do not break existing functionality — especially the Nodes page (`/nodes`,
  `main/MainApp.jsx`) and its calculations.** Every task that touches shared files
  (`Footer`, `MainApp.jsx`) must be additive: new exports/props/branches alongside
  existing code, never a rewrite of existing logic.
- After every task's own test/build check (below), and **again as a dedicated final
  milestone check**: run the full suite (`cd client && CI=true npx react-scripts test
  --watchAll=false`, expect all passing, count only ever goes up from the current 224),
  the production build (`npx react-scripts build`, expect exit 0 with **exactly** the 4
  pre-existing baseline warning files — `Navbar/index.jsx`, `NodeGridTable/index.jsx`,
  `LayoutContext.jsx`, `WalletNodes/index.jsx` — nothing else), and a manual pass against
  the demo wallet (`yarn start`, then either navigate to `/demo` directly or click the
  Demo nav button, which loads the same data as
  `https://fluxnode.app.runonflux.io/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ`) —
  confirm node counts, estimated earnings, wallet FLUX/USD values, and the node grid all
  still render and match what they showed before this session's changes.
- Client-side only — no backend work in this plan (matches the spec's "Verification
  location: client-side" decision).
- New code follows this codebase's existing conventions: named exports, `camelCase`
  filenames for pure modules (`donorStatus.js`), `PascalCase` directories for components
  with an `index.jsx`, SCSS co-located per component, tests co-located as `*.test.js`
  next to the module they cover (matches `live/apidata.test.js`, `currency.test.js`).
- Verified 2026-09-05 against a live response from
  `https://explorer.runonflux.io/api/txs?address=<donation address>`: transactions come
  back **newest-first by block height** (first entry `blockheight: 2408006`, second
  `blockheight: 2407993`) — the early-stop pagination in Task 3 relies on this and it is
  confirmed, not an open assumption.

---

## Task 1: Donor config constants

**Files:**
- Modify: `client/src/donor/config.js`

**Interfaces:**
- Produces: `DONOR_THRESHOLD_FLUX` (number), `DONOR_WINDOW_DAYS` (number),
  `DONOR_STATUS_CACHE_TTL_MS` (number), `DONOR_MAX_PAGES_FETCHED` (number) — all named
  exports, consumed by Tasks 2 and 3.

- [ ] **Step 1: Read the current file**

Read `client/src/donor/config.js` in full before editing — it currently has one export,
`isPremiumTestingUnlocked()`. Don't remove or restructure it.

- [ ] **Step 2: Add the new constants above the existing function**

```js
// Sum of FLUX a wallet must have sent to ADDRESS_FLUX within DONOR_WINDOW_DAYS to
// qualify as a donor. Tunable — not hardcoded inline anywhere else.
export const DONOR_THRESHOLD_FLUX = 10;
export const DONOR_WINDOW_DAYS = 365;

// How long a verified donor-status result is trusted before fetch_donor_status
// re-checks the chain, matching fluxinfo.js's cache TTL convention.
export const DONOR_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// Safety cap on explorer API pages fetched per check, for wallets whose donation
// address has an unusually long transaction history.
export const DONOR_MAX_PAGES_FETCHED = 20;
```

- [ ] **Step 3: Verify the file still exports `isPremiumTestingUnlocked`**

Run: `grep -n "export" client/src/donor/config.js`
Expected output includes all five exports: the four new constants plus
`export function isPremiumTestingUnlocked()`.

- [ ] **Step 4: Commit**

```bash
git add client/src/donor/config.js
git commit -m "feat(donor): add donor-status config constants"
```

---

## Task 2: `computeDonorStatus` — pure windowing/expiry algorithm

**Files:**
- Create: `client/src/donor/donorStatus.js`
- Test: `client/src/donor/donorStatus.test.js`

**Interfaces:**
- Consumes: `DONOR_THRESHOLD_FLUX`, `DONOR_WINDOW_DAYS` from `donor/config` (Task 1).
- Produces: `computeDonorStatus(records, nowMs = Date.now())` →
  `{ isDonor: boolean, totalInWindow: number, expiresAt: number|null, daysLeft: number }`,
  where `records` is `Array<{ date: number /* ms epoch */, amount: number }>`. Exported
  (not default) so Task 3 and the test file can both import it directly. Consumed by
  Task 3.

- [ ] **Step 1: Write the failing tests**

Create `client/src/donor/donorStatus.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/donor/donorStatus.test.js --watchAll=false`
Expected: FAIL — `donorStatus.js` doesn't exist yet, so the import fails.

- [ ] **Step 3: Write `computeDonorStatus`**

Create `client/src/donor/donorStatus.js`:

```js
import { DONOR_THRESHOLD_FLUX, DONOR_WINDOW_DAYS } from 'donor/config';

const WINDOW_MS = DONOR_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/*
 * Pure — no network, no storage. Given every donation record known within the
 * trailing window, decides donor status and, if qualified, the exact date the
 * running total would first drop below DONOR_THRESHOLD_FLUX as records age
 * past their own 365-day mark. This is what makes "days left" always
 * chain-accurate instead of a separately stored, driftable expiry.
 */
export function computeDonorStatus(records, nowMs = Date.now()) {
  const windowStart = nowMs - WINDOW_MS;
  const inWindow = (records || []).filter((r) => r.date >= windowStart && r.date <= nowMs);
  const totalInWindow = inWindow.reduce((sum, r) => sum + r.amount, 0);

  if (totalInWindow < DONOR_THRESHOLD_FLUX) {
    return { isDonor: false, totalInWindow, expiresAt: null, daysLeft: 0 };
  }

  // Oldest-first: each record "ages out" of the window at record.date + 365d.
  // Walk those drop dates in order, subtracting as we go, until the running
  // total would first fall below the threshold — that's the real expiry.
  const oldestFirst = [...inWindow].sort((a, b) => a.date - b.date);
  let running = totalInWindow;
  let expiresAt = null;
  for (const record of oldestFirst) {
    running -= record.amount;
    if (running < DONOR_THRESHOLD_FLUX) {
      expiresAt = record.date + WINDOW_MS;
      break;
    }
  }
  // totalInWindow >= DONOR_THRESHOLD_FLUX (checked above) and DONOR_THRESHOLD_FLUX > 0,
  // so removing every record eventually drives running to 0, which is always
  // < DONOR_THRESHOLD_FLUX — the loop cannot exit without setting expiresAt.

  const daysLeft = Math.max(0, Math.ceil((expiresAt - nowMs) / (24 * 60 * 60 * 1000)));
  return { isDonor: true, totalInWindow, expiresAt, daysLeft };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/donor/donorStatus.test.js --watchAll=false`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/donorStatus.js client/src/donor/donorStatus.test.js
git commit -m "feat(donor): add computeDonorStatus, the pure windowing/expiry algorithm"
```

---

## Task 3: `fetch_donor_status` — fetch, parse, cache

**Files:**
- Modify: `client/src/donor/donorStatus.js`
- Modify: `client/src/donor/donorStatus.test.js`

**Interfaces:**
- Consumes: `computeDonorStatus` (Task 2, same file), `ADDRESS_FLUX` from `content/index`,
  `DONOR_MAX_PAGES_FETCHED`, `DONOR_STATUS_CACHE_TTL_MS` from `donor/config` (Task 1).
- Produces: `fetch_donor_status(walletAddress: string): Promise<{isDonor, totalInWindow,
  expiresAt, daysLeft}>` — the same shape `computeDonorStatus` returns. Consumed by
  Task 4 (`DonorContext`) and Task 6 (`DonorUnlockDialog`).

- [ ] **Step 1: Write the failing tests**

Append to `client/src/donor/donorStatus.test.js` (new `describe` block, same file):

```js
describe('fetch_donor_status', () => {
  const WALLET = 't1SenderRealWalletAddressXXXXXXXXX';
  const DONATION_ADDR = window.gContent.ADDRESS_FLUX;

  // Full Insight-API tx shape, same convention as live/apidata.test.js's
  // realTransparentTx() — the extra fields (n, scriptSig, confirmations, fees)
  // real /api/txs responses carry, not a hand-trimmed minimal fixture.
  function realDonationTx({ blockheight, time, amount, fromWallet = WALLET }) {
    return {
      txid: `tx-${blockheight}`,
      version: 4,
      locktime: 0,
      blockheight,
      confirmations: 1000,
      time,
      blocktime: time,
      vin: [{
        txid: 'prevtx', vout: 0, sequence: 4294967295, n: 0,
        scriptSig: { hex: '...', asm: '...' },
        addr: fromWallet, valueSat: 0, value: 0,
      }],
      vout: [
        {
          value: amount.toFixed(8), n: 0,
          scriptPubKey: { hex: '...', asm: '...', addresses: [DONATION_ADDR], type: 'pubkeyhash' },
          spentTxId: null,
        },
        {
          value: '0.01000000', n: 1,
          scriptPubKey: { hex: '...', asm: '...', addresses: [fromWallet], type: 'pubkeyhash' }, // change
          spentTxId: null,
        },
      ],
      isCoinBase: false,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockJsonResponse(body) {
    return {
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => body,
    };
  }

  it('sums donations from the wallet across a single page', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [
        realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 6 }),
        realDonationTx({ blockheight: 99, time: nowSec - 20 * 86400, amount: 6 }),
      ],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(result.isDonor).toBe(true);
    expect(result.totalInWindow).toBeCloseTo(12);
  });

  it('ignores a transaction sent by a different wallet', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 50, fromWallet: 'someone-else' })],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(result.isDonor).toBe(false);
    expect(result.totalInWindow).toBe(0);
  });

  it('stops paginating once it reaches a transaction older than the window, without fetching further pages', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 3,
      txs: [
        realDonationTx({ blockheight: 200, time: nowSec - 5 * 86400, amount: 20 }),
        realDonationTx({ blockheight: 50, time: nowSec - 400 * 86400, amount: 999 }), // past the window — stop here
      ],
    }));

    const result = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(1); // never fetched page 2 or 3
    expect(result.totalInWindow).toBeCloseTo(20); // the 999 past the window never counted
  });

  it('caches a result and serves it without a second network call within the TTL', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      pagesTotal: 1,
      txs: [realDonationTx({ blockheight: 100, time: nowSec - 10 * 86400, amount: 15 })],
    }));

    const first = await fetch_donor_status(WALLET);
    const second = await fetch_donor_status(WALLET);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('fails soft — not a donor, not a throw — when the explorer is unreachable', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    await expect(fetch_donor_status(WALLET)).resolves.toEqual(
      expect.objectContaining({ isDonor: false })
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx react-scripts test src/donor/donorStatus.test.js --watchAll=false`
Expected: FAIL — `fetch_donor_status` isn't exported yet (`TypeError: fetch_donor_status is not a function` or an import error).

- [ ] **Step 3: Write `fetch_donor_status` and its helpers**

Append to `client/src/donor/donorStatus.js` (below `computeDonorStatus`):

```js
import { ADDRESS_FLUX } from 'content/index';
import { DONOR_MAX_PAGES_FETCHED, DONOR_STATUS_CACHE_TTL_MS } from 'donor/config';

const TXS_BY_ADDRESS_ENDPOINT = 'https://explorer.runonflux.io/api/txs';
const DONOR_STATUS_CACHE_KEY = 'donorStatus_v1';

async function safeFetchJson(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Sums every vout in `tx` paid to `address` — a tx can pay the same address
// more than once, so this is a sum, not a find-first.
function sumVoutToAddress(tx, address) {
  return (tx.vout || []).reduce((sum, vout) => {
    const addresses = vout.scriptPubKey?.addresses || [];
    return addresses.includes(address) ? sum + Number(vout.value) : sum;
  }, 0);
}

function readDonorStatusCache(address) {
  try {
    const raw = localStorage.getItem(DONOR_STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.address !== address) return null;
    if (Date.now() - parsed.timestamp >= DONOR_STATUS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeDonorStatusCache(address, data) {
  try {
    localStorage.setItem(DONOR_STATUS_CACHE_KEY, JSON.stringify({ address, data, timestamp: Date.now() }));
  } catch {
    // localStorage unavailable/full — non-fatal, just skip caching this result
  }
}

/*
 * Pages through the donation address's own transaction history (same
 * endpoint apidata.js's fetch_total_donations already uses), stopping as
 * soon as a transaction older than the DONOR_WINDOW_DAYS window is reached
 * — confirmed 2026-09-05 that this API returns newest-first, so early-stop
 * is safe. Unlike fetch_total_donations (which only counts matching tx
 * occurrences), this sums the real FLUX amount paid to the donation address
 * by `walletAddress` specifically.
 */
export async function fetch_donor_status(walletAddress) {
  const cached = readDonorStatusCache(walletAddress);
  if (cached) return cached;

  const nowMs = Date.now();
  const windowStartSec = Math.floor(nowMs / 1000) - 365 * 24 * 60 * 60;
  const baseUrl = `${TXS_BY_ADDRESS_ENDPOINT}?address=${ADDRESS_FLUX}`;

  const records = [];
  let pageNum = 0;
  let pagesTotal = 1;
  let hitWindowEdge = false;

  while (!hitWindowEdge && pageNum < pagesTotal && pageNum < DONOR_MAX_PAGES_FETCHED) {
    const url = pageNum === 0 ? baseUrl : `${baseUrl}&pageNum=${pageNum}`;
    const json = await safeFetchJson(url);
    if (!json) break; // explorer unreachable — use whatever was gathered so far

    pagesTotal = json.pagesTotal || 1;
    const txs = Array.isArray(json.txs) ? json.txs : [];

    for (const tx of txs) {
      if (tx.time < windowStartSec) {
        hitWindowEdge = true;
        break;
      }
      const sentByWallet = (tx.vin || []).some((v) => v.addr === walletAddress);
      if (!sentByWallet) continue;
      const amount = sumVoutToAddress(tx, ADDRESS_FLUX);
      if (amount > 0) records.push({ date: tx.time * 1000, amount });
    }

    pageNum += 1;
  }

  const result = computeDonorStatus(records, nowMs);
  writeDonorStatusCache(walletAddress, result);
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx react-scripts test src/donor/donorStatus.test.js --watchAll=false`
Expected: PASS, all 12 tests (7 from Task 2 + 5 new).

- [ ] **Step 5: Run the full suite to confirm nothing else broke**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass, total test count is 224 + 12 = 236.

- [ ] **Step 6: Commit**

```bash
git add client/src/donor/donorStatus.js client/src/donor/donorStatus.test.js
git commit -m "feat(donor): add fetch_donor_status — paginated, cached, early-stop verification"
```

---

## Task 4: Wire `DonorContext` to real verification

**Files:**
- Modify: `client/src/contexts/DonorContext.jsx`

**Interfaces:**
- Consumes: `fetch_donor_status` (Task 3), `isPremiumTestingUnlocked` (existing, Task 1's
  file).
- Produces: `useDonorStatus()` now returns a context value where `setDonorWallet(address,
  status = null)` and `refreshDonorStatus()` are real (no longer no-ops), and
  `donorWallet` persists across reloads via `localStorage`. Consumed by Task 6
  (`DonorUnlockDialog`), Task 7 (`PremiumGate`), Task 8 (`DonorBadge`), Task 9
  (`MainApp.jsx`).

- [ ] **Step 1: Read the current file**

Read `client/src/contexts/DonorContext.jsx` in full — confirm it still matches the
PR #165 shape (`isUnlocked` from the testing flag only, `donorWallet: null`, two
no-op functions) before editing.

- [ ] **Step 2: Replace the file's contents**

```jsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isPremiumTestingUnlocked } from 'donor/config';
import { fetch_donor_status } from 'donor/donorStatus';

export const DonorContext = createContext(null);

const DONOR_WALLET_STORAGE_KEY = 'donorWallet';

function readStoredWallet() {
  try {
    return localStorage.getItem(DONOR_WALLET_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/*
 * Gates premium features (currently /live). `isUnlocked` is true when either
 * the PREMIUM_TESTING_MODE flag is set (see donor/config.js) OR a verified
 * donor wallet is active — the testing flag is an override on top of real
 * verification, not a replacement for it.
 *
 * `donorWallet` restores from localStorage on mount so unlock survives a
 * reload; the restored wallet is then re-verified via fetch_donor_status
 * (which has its own shorter-lived cache, so this is usually instant, not a
 * fresh network round trip every load).
 */
export function DonorProvider({ children }) {
  const [donorWallet, setDonorWalletState] = useState(readStoredWallet);
  const [donorStatus, setDonorStatus] = useState(null);

  const refreshDonorStatus = useCallback(async () => {
    if (!donorWallet) {
      setDonorStatus(null);
      return null;
    }
    const status = await fetch_donor_status(donorWallet);
    setDonorStatus(status);
    return status;
  }, [donorWallet]);

  // Sets the active wallet. If the caller already has a fresh status result
  // (DonorUnlockDialog does, from its own verification check), pass it as
  // `status` to avoid a redundant re-fetch; otherwise this schedules one via
  // the effect below.
  const setDonorWallet = useCallback((address, status = null) => {
    setDonorWalletState(address);
    try {
      if (address) localStorage.setItem(DONOR_WALLET_STORAGE_KEY, address);
      else localStorage.removeItem(DONOR_WALLET_STORAGE_KEY);
    } catch {
      // localStorage unavailable — unlock just won't survive a reload this session
    }
    setDonorStatus(status);
  }, []);

  useEffect(() => {
    if (donorWallet && !donorStatus) refreshDonorStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorWallet]);

  const isUnlocked = isPremiumTestingUnlocked() || donorStatus?.isDonor === true;

  const value = useMemo(() => ({
    isUnlocked, donorWallet, donorStatus, setDonorWallet, refreshDonorStatus,
  }), [isUnlocked, donorWallet, donorStatus, setDonorWallet, refreshDonorStatus]);

  return <DonorContext.Provider value={value}>{children}</DonorContext.Provider>;
}

export function useDonorStatus() {
  return useContext(DonorContext);
}
```

- [ ] **Step 3: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, same 236 total as after Task 3 (this task has no new tests of its
own — `DonorContext` is exercised indirectly once Tasks 6-9 build UI on top of it; it's
a plain object/hooks module with no test file today per PR #165, and this plan doesn't
introduce one in isolation since there's no pure logic left in it to test that isn't
already covered by `donorStatus.test.js`).

- [ ] **Step 4: Build to confirm no new warnings**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files as before this task.

- [ ] **Step 5: Commit**

```bash
git add client/src/contexts/DonorContext.jsx
git commit -m "feat(donor): wire DonorContext to real fetch_donor_status verification"
```

---

## Task 5: Export `DonateChip` from Footer

**Files:**
- Modify: `client/src/components/Footer/index.jsx`

**Interfaces:**
- Produces: `DonateChip({ label: string, address: string })` as a named export (it
  already exists as an unexported local function in this file — this task only adds
  `export`, no behavior change). Consumed by Task 6 (`DonorUnlockDialog`).

- [ ] **Step 1: Read the current file**

Read `client/src/components/Footer/index.jsx` in full. Confirm `DonateChip` is defined
around the top of the file as `function DonateChip({ label, address }) { ... }` with no
`export` keyword, and that `Footer()` (the default-ish named export used elsewhere)
renders it internally further down.

- [ ] **Step 2: Add the export**

Change:
```js
function DonateChip({ label, address }) {
```
to:
```js
export function DonateChip({ label, address }) {
```

This is the only change in this task — do not touch `Footer()` or anything else in the
file.

- [ ] **Step 3: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, unchanged count (this is a pure export addition, no new tests
needed — `DonateChip`'s own behavior is unchanged and untested today, consistent with
the rest of `Footer`).

- [ ] **Step 4: Build to confirm the Footer (and its existing donation chips) still render**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Footer/index.jsx
git commit -m "refactor(footer): export DonateChip so DonorUnlockDialog can reuse it"
```

---

## Task 6: `DonorUnlockDialog`

**Files:**
- Create: `client/src/donor/DonorUnlockDialog/index.jsx`
- Create: `client/src/donor/DonorUnlockDialog/index.scss`

**Interfaces:**
- Consumes: `useDonorStatus` (Task 4) for `setDonorWallet`; `fetch_donor_status` (Task 3)
  called directly for the dialog's own immediate checking/result feedback (calling it
  twice — once here, once inside `setDonorWallet`'s effect — is avoided by passing the
  already-fetched `status` into `setDonorWallet(address, status)`); `validateAddress`
  from `apidata` (existing, `apidata.js:902`); `DonateChip` (Task 5) and `ADDRESS_FLUX`
  from `content/index` (existing); `DONOR_THRESHOLD_FLUX` from `donor/config` (Task 1).
- Produces: `DonorUnlockDialog({ isOpen: boolean, onClose: () => void })`, a named
  export. Consumed by Task 7 (`PremiumGate`).

- [ ] **Step 1: Create the directory and component file**

Create `client/src/donor/DonorUnlockDialog/index.jsx`:

```jsx
import { useCallback, useState } from 'react';
import { Button, Dialog, InputGroup, Spinner } from '@blueprintjs/core';
import { validateAddress } from 'apidata';
import { fetch_donor_status } from 'donor/donorStatus';
import { DONOR_THRESHOLD_FLUX } from 'donor/config';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonateChip } from 'components/Footer';
import { ADDRESS_FLUX } from 'content/index';
import './index.scss';

const STATUS = { IDLE: 'idle', CHECKING: 'checking', SUCCESS: 'success', FAILURE: 'failure', INVALID: 'invalid' };

/*
 * The only place a wallet address is entered to unlock premium features.
 * Checks are always a full fetch_donor_status call here (never assumed) —
 * on success, the result is handed to DonorContext.setDonorWallet directly
 * so it doesn't have to re-fetch what this dialog just fetched.
 */
export function DonorUnlockDialog({ isOpen, onClose }) {
  const { setDonorWallet } = useDonorStatus();
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [result, setResult] = useState(null);

  const handleCheck = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setStatus(STATUS.CHECKING);
    setResult(null);

    const looksReal = await validateAddress(trimmed);
    if (!looksReal) {
      setStatus(STATUS.INVALID);
      return;
    }

    const donorResult = await fetch_donor_status(trimmed);
    setResult(donorResult);
    if (donorResult.isDonor) {
      setDonorWallet(trimmed, donorResult);
      setStatus(STATUS.SUCCESS);
    } else {
      setStatus(STATUS.FAILURE);
    }
  }, [address, setDonorWallet]);

  const handleClose = useCallback(() => {
    setAddress('');
    setStatus(STATUS.IDLE);
    setResult(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Unlock premium features" className="donor-unlock-dialog">
      <div className="donor-unlock-body">
        <p className="donor-unlock-intro">
          Send at least {DONOR_THRESHOLD_FLUX} FLUX to our donation address within the
          last year, then enter the wallet you sent it from below.
        </p>

        <div className="donor-unlock-input-row">
          <InputGroup
            placeholder="t1... or t3..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={status === STATUS.CHECKING}
            fill
          />
          <Button
            text={status === STATUS.CHECKING ? 'Checking…' : 'Check wallet'}
            icon={status === STATUS.CHECKING ? <Spinner size={16} /> : 'search'}
            onClick={handleCheck}
            disabled={!address.trim() || status === STATUS.CHECKING}
            intent="primary"
          />
        </div>

        {status === STATUS.INVALID && (
          <div className="donor-unlock-message donor-unlock-message--error">
            That doesn't look like a real Flux wallet address.
          </div>
        )}

        {status === STATUS.SUCCESS && result && (
          <div className="donor-unlock-message donor-unlock-message--success">
            Unlocked — donor status active, {result.daysLeft} days left.
          </div>
        )}

        {status === STATUS.FAILURE && result && (
          <div className="donor-unlock-message donor-unlock-message--error">
            <span>
              This wallet has sent {result.totalInWindow.toFixed(2)} FLUX in the last
              year — needs at least {DONOR_THRESHOLD_FLUX}.
            </span>
            <DonateChip label="FLUX" address={ADDRESS_FLUX} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create the stylesheet**

Create `client/src/donor/DonorUnlockDialog/index.scss`:

```scss
.donor-unlock-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
}

.donor-unlock-intro {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-tertiary);
}

.donor-unlock-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.donor-unlock-message {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
  padding: 10px 12px;
  border-radius: var(--radius-md);

  &--success {
    color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  &--error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }
}
```

- [ ] **Step 3: Build to confirm the new component compiles cleanly**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warning files (this component isn't mounted anywhere
yet — Task 7 wires it in — so this step only confirms it compiles, not that it renders
correctly; that's verified in Task 7's manual check).

- [ ] **Step 4: Commit**

```bash
git add client/src/donor/DonorUnlockDialog
git commit -m "feat(donor): add DonorUnlockDialog"
```

---

## Task 7: Wire `DonorUnlockDialog` into `PremiumGate`

**Files:**
- Modify: `client/src/donor/PremiumGate/index.jsx`
- Modify: `client/src/donor/PremiumGate/index.scss`

**Interfaces:**
- Consumes: `DonorUnlockDialog` (Task 6).
- Produces: `PremiumGate`'s locked state now includes a working "Unlock" button — no
  change to its `{ feature, children }` props or its behavior when `isUnlocked` is true.

- [ ] **Step 1: Read the current file**

Read `client/src/donor/PremiumGate/index.jsx` in full — confirm it currently just
renders a static locked message with no interactivity (PR #165 shape).

- [ ] **Step 2: Replace the file's contents**

```jsx
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@blueprintjs/core';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonorUnlockDialog } from 'donor/DonorUnlockDialog';
import './index.scss';

/*
 * Wraps a premium route. Shows a locked explainer with a real "Unlock" button
 * in place of real content when not unlocked — the button opens
 * DonorUnlockDialog, the only place a wallet is entered. Deliberately kept
 * here rather than in the Navbar's click handler, so any future premium
 * route (e.g. /analytics) gets a working unlock affordance for free just by
 * wrapping it in this same component.
 */
export function PremiumGate({ feature, children }) {
  const { isUnlocked } = useDonorStatus();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isUnlocked) return children;

  return (
    <div className="premium-gate-locked">
      <Lock size={28} className="premium-gate-locked-icon" />
      <span className="premium-gate-locked-title">{feature} is a premium feature</span>
      <span className="premium-gate-locked-body">
        Send FLUX to our donation address to unlock it.
      </span>
      <Button text="Unlock" intent="primary" onClick={() => setDialogOpen(true)} />
      <DonorUnlockDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
```

Note: the locked-body copy changes from "Donor-based unlocking ... is coming soon" (PR
#165) to the line above, since real unlocking now exists.

- [ ] **Step 3: Add a button margin to the stylesheet**

Read `client/src/donor/PremiumGate/index.scss` first, then add (don't remove anything
already there):

```scss
.premium-gate-locked .bp4-button {
  margin-top: 4px;
}
```

- [ ] **Step 4: Manual check — the actual unlock flow, end to end**

Run: `cd client && yarn start`, then in a browser:
1. Navigate to `/live` (or set `PREMIUM_TESTING_MODE` back to `false` first in
   `client/public/runtime/app-content.js` if you'd left it `true` from earlier testing —
   this flow must be checked with the testing bypass OFF, to actually exercise real
   verification).
2. Confirm the locked explainer renders with a working "Unlock" button.
3. Click it — confirm the dialog opens.
4. Enter a real address that is known NOT to have donated (e.g. any random valid
   Flux address) — confirm it lands on the "sent X FLUX, needs 10" failure message
   with a working donation-address copy chip.
5. Enter an address known to have sent ≥10 FLUX to the current `ADDRESS_FLUX` within
   the last year (find one via the Home page's existing "Total donations" badge on the
   donation address's own history, or ask the user for a known-good test wallet) —
   confirm it shows the success message and `/live` becomes accessible immediately
   without a page reload.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/PremiumGate
git commit -m "feat(donor): wire DonorUnlockDialog into PremiumGate's locked state"
```

---

## Task 8: `DonorBadge`, mounted on Home

**Files:**
- Create: `client/src/donor/DonorBadge/index.jsx`
- Modify: `client/src/home/Home.jsx`

**Interfaces:**
- Consumes: `useDonorStatus` (Task 4).
- Produces: `DonorBadge()` — no props, reads context directly, renders `null` when not
  a donor. Named export. Consumed by this task's `Home.jsx` change and Task 9's
  `MainApp.jsx` change.

- [ ] **Step 1: Create the badge component**

Create `client/src/donor/DonorBadge/index.jsx`:

```jsx
import { FaMedal } from 'react-icons/fa';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useDonorStatus } from 'contexts/DonorContext';

/*
 * A SEPARATE thing from Home.jsx's existing "Total donations: N" badge
 * (which shows lifetime donation tx count for WHATEVER wallet is currently
 * being viewed on Home — unrelated to premium-unlock status). This badge
 * reflects the ACTIVE donor context specifically: only renders when the
 * connected wallet (DonorContext.donorWallet) is a verified, unlocked donor.
 */
export function DonorBadge() {
  const { donorStatus } = useDonorStatus();
  if (!donorStatus?.isDonor) return null;

  return (
    <Tooltip2 content={`Donor active — ${donorStatus.daysLeft} days left`} hoverOpenDelay={60}>
      <span className="donor-badge d-inline-flex align-items-center gap-1">
        <FaMedal color="gold" size={16} />
        Donor
      </span>
    </Tooltip2>
  );
}
```

(`d-inline-flex align-items-center gap-1` are existing Bootstrap utility classes already
used elsewhere in this codebase, e.g. `home/Home.jsx`'s own donation badge — no new CSS
file needed for this simple a layout.)

- [ ] **Step 2: Mount it in `Home.jsx`, additively**

Read `client/src/home/Home.jsx`'s `renderActiveAddressView()` method (documented at
lines 389-420 in the spec) before editing. Add the import at the top of the file
alongside the other component imports:

```js
import { DonorBadge } from 'donor/DonorBadge';
```

Then in `renderActiveAddressView()`, add `<DonorBadge />` inside the existing
`<div className='d-flex gap-2'>` wrapper, alongside (not replacing) the existing
donation-count `Tooltip2` block:

```jsx
<div className='d-flex gap-2'>
  <span>Current Wallet Address</span>
  <DonorBadge />
  {this.state.totalDonations > 0 ? (
    <Tooltip2
      ...
```

Do not touch anything else in this method or in `Home.jsx` — this is the only change in
this task.

- [ ] **Step 3: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, unchanged count.

- [ ] **Step 4: Build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 5: Manual check — Home page still works, badge appears correctly**

With the dev server running (`yarn start`), unlock a donor wallet via the flow from
Task 7 Step 4, then navigate to `/home` and search that same wallet address. Confirm:
- The page loads exactly as before (price, node counts, earnings, PA summary — no
  visual regression).
- The new "Donor" badge appears next to "Current Wallet Address" with a working
  tooltip showing days left.
- Searching a DIFFERENT (non-donor) wallet does not show the badge, and the rest of
  Home still renders correctly for it.

- [ ] **Step 6: Commit**

```bash
git add client/src/donor/DonorBadge client/src/home/Home.jsx
git commit -m "feat(donor): add DonorBadge, mount on Home"
```

---

## Task 9: `DonorBadge` + wallet fallback on the Nodes page

**Files:**
- Modify: `client/src/Application.jsx`
- Modify: `client/src/main/MainApp.jsx`

**This is the highest-risk task in this plan** — it's the one that touches
`MainApp.jsx`, per the global constraint. Every change here is additive: a new optional
prop and a new `else if` branch that only ever runs when that prop is set, mirroring
exactly what the existing branch already does for a URL-supplied wallet. Nothing
existing is modified or removed.

**Interfaces:**
- Consumes: `DonorContext` (Task 4) via `DonorContext.Consumer`, `DonorBadge` (Task 8).
- Produces: `<MainApp donorWallet={string|null} ... />` — a new optional prop `MainApp`
  did not previously accept. No other component depends on this prop existing.

- [ ] **Step 1: Read both files' relevant sections first**

Read `client/src/Application.jsx` in full (it's short — under 200 lines).
Read `client/src/main/MainApp.jsx`'s `hydrateApp()` method (documented above, roughly
lines 264-290) and its constructor/render method for where `renderActiveAddressView`-
equivalent wallet-address UI lives, so you know where to add `<DonorBadge />`.

- [ ] **Step 2: Pass `donorWallet` down to `MainApp` from the route**

In `client/src/Application.jsx`, find the `/nodes` route:

```jsx
<Route
  path='/nodes'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <MainApp theme={darkMode ? 'dark' : 'light'} />
      </React.Suspense>
    </ErrorBoundary>
  }
/>
```

Change it to read the active donor wallet from context and pass it down, without
altering anything else about the route:

```jsx
<Route
  path='/nodes'
  element={
    <ErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
        <DonorContext.Consumer>
          {({ donorWallet }) => (
            <MainApp theme={darkMode ? 'dark' : 'light'} donorWallet={donorWallet} />
          )}
        </DonorContext.Consumer>
      </React.Suspense>
    </ErrorBoundary>
  }
/>
```

Add the import at the top of the file, alongside the existing `DonorProvider` import:

```js
import { DonorContext } from 'contexts/DonorContext';
```

- [ ] **Step 3: Add the additive fallback branch in `hydrateApp()`**

In `client/src/main/MainApp.jsx`, find `hydrateApp()`:

```js
async hydrateApp() {
  const { location } = this.props.router;
  let params = new URLSearchParams(location.search);
  let wallet = params.get('wallet');

  this._getTotalScoreAgainstSearchedWallet(wallet);

  if (!!wallet && wallet != '') {
    if (this.state.privacyMode) {
      wallet = this.activeAddress ?? this.state.searchHistory[this.state.searchHistory - 1];
      
    }
    const address = wallet.toString();

    this.onProcessAddress(address);
    this.addressInputRef.current.value = address;
    this.setState({ inputAddress: address });
  } else {
    fetch_global_stats(null)
      .then((gstore) => {
        this.setState({ gstore });
        return fetch_total_network_utils(gstore);
      })
      .then((gstore) => {
        this.setState({ gstore });
        this.context.setLastUpdated(new Date());
        this.context.setArcaneHumanVersion(gstore.arcane_os?.humanVersion ?? null);
      });
  }
}
```

Insert a new `else if` branch **between** the existing `if` and `else` — do not modify
either existing branch's body:

```js
async hydrateApp() {
  const { location } = this.props.router;
  let params = new URLSearchParams(location.search);
  let wallet = params.get('wallet');

  this._getTotalScoreAgainstSearchedWallet(wallet);

  if (!!wallet && wallet != '') {
    if (this.state.privacyMode) {
      wallet = this.activeAddress ?? this.state.searchHistory[this.state.searchHistory - 1];
      
    }
    const address = wallet.toString();

    this.onProcessAddress(address);
    this.addressInputRef.current.value = address;
    this.setState({ inputAddress: address });
  } else if (this.props.donorWallet) {
    // A wallet unlocked as a donor elsewhere (e.g. via the /live unlock
    // dialog) but with no ?wallet= param on THIS page yet — surface it here
    // too, the same way a URL-supplied wallet is processed above. Only
    // engages when no URL wallet is present, so it never overrides an
    // explicit navigation.
    const address = this.props.donorWallet;
    this.onProcessAddress(address);
    this.addressInputRef.current.value = address;
    this.setState({ inputAddress: address });
  } else {
    fetch_global_stats(null)
      .then((gstore) => {
        this.setState({ gstore });
        return fetch_total_network_utils(gstore);
      })
      .then((gstore) => {
        this.setState({ gstore });
        this.context.setLastUpdated(new Date());
        this.context.setArcaneHumanVersion(gstore.arcane_os?.humanVersion ?? null);
      });
  }
}
```

- [ ] **Step 4: Mount `DonorBadge` in `MainApp.jsx`'s address display**

`MainApp.jsx` has its own `renderActiveAddressView(privacyMode)` method (line 436) —
a byte-for-byte structural match of `Home.jsx`'s method of the same name from Task 8.
Add the same import used in Task 8:

```js
import { DonorBadge } from 'donor/DonorBadge';
```

Then change:
```jsx
  renderActiveAddressView(privacyMode) {
    return (
      <div className='d-flex justify-content-between adp-bg-normal addrview'>
        <div className='d-flex gap-2'>
          <span>Current Wallet Address</span>
          {this.state.totalDonations > 0 ? (
```
to:
```jsx
  renderActiveAddressView(privacyMode) {
    return (
      <div className='d-flex justify-content-between adp-bg-normal addrview'>
        <div className='d-flex gap-2'>
          <span>Current Wallet Address</span>
          <DonorBadge />
          {this.state.totalDonations > 0 ? (
```
Nothing else in this method changes — same as Task 8's edit to `Home.jsx`.

- [ ] **Step 5: Run the full suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all pass, unchanged count from Task 8.

- [ ] **Step 6: Build**

Run: `cd client && npx react-scripts build`
Expected: exit 0, same 4 baseline warnings.

- [ ] **Step 7: Manual regression check against the demo wallet — the critical one**

With `yarn start` running:
1. Click the **Demo** nav button (or navigate to `/demo`) — this is the same data as
   `https://fluxnode.app.runonflux.io/#/demo?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ`.
   Confirm Flux price, total node counts (Cumulus/Nimbus/Stratus), estimated earnings
   (daily/monthly, FLUX and USD), wallet FLUX/USD balance, Parallel Assets, and
   utilization bars all render with sensible values — compare against the live hosted
   demo URL above if there's any doubt about a number looking off.
2. Navigate to `/nodes` directly (no `?wallet=` in the URL, and with no donor wallet
   unlocked in this browser session/localStorage) — confirm it behaves exactly as
   before: the global-stats-only view, no address prefilled, no errors in the console.
3. Navigate to `/nodes?wallet=<any real address>` — confirm the existing URL-driven
   wallet flow still works exactly as before (this exercises the untouched `if` branch).
4. With a donor wallet unlocked via Task 7's flow, navigate to `/nodes` with **no**
   `?wallet=` param — confirm the donor wallet now prefills automatically (the new
   branch engaging) and the node grid/calculations for it match what searching that
   same address manually would show.
5. Open the browser console throughout all four checks above — confirm no new errors
   or warnings appear that weren't there before this task.

- [ ] **Step 8: Commit**

```bash
git add client/src/Application.jsx client/src/main/MainApp.jsx
git commit -m "feat(donor): surface DonorBadge and a donor-wallet fallback on the Nodes page"
```

---

## Final milestone: full regression pass

- [ ] **Step 1: Full test suite**

Run: `cd client && CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass, 236 total tests (224 baseline + 12 from Tasks 2-3).

- [ ] **Step 2: Production build**

Run: `cd client && npx react-scripts build`
Expected: exit 0. Warning files are **exactly** these 4, nothing added or removed:
`src\components\Navbar\index.jsx`, `src\components\NodeGridTable\index.jsx`,
`src\contexts\LayoutContext.jsx`, `src\main\WalletNodes\index.jsx`.

- [ ] **Step 3: Full demo-wallet walkthrough, one more time, fresh**

Repeat Task 9 Step 7's four checks in full, plus:
- `/home` with the demo/known wallet — same numbers as before this plan started.
- `/live` — locked without a donor wallet, unlocks correctly with one, still shows
  real block data once unlocked (this plan didn't touch `Live.jsx` itself, but confirm
  the gate around it didn't regress).

- [ ] **Step 4: Open the PR**

```bash
git push -u origin <branch-name>
gh pr create --base feat/premium-testing-toggle --title "Real donor verification (Part B, Session 1)" --body "..."
```

Note in the PR body which manual checks were run (Steps 1-3 above) and their outcomes,
following this session's established convention (see PR #164/#165's own bodies for the
format).
