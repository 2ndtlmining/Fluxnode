# Donation Notes and Costs Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the on-chain note attached to each donation, and add a second "Costs" tab to the Home Community Support panel that categorises every payment made *out* of the donation address.

**Architecture:** Both features are a **second reading of the existing donation scan** — no new explorer requests. The scan already returns outgoing transactions and OP_RETURN note outputs; today's cache trim throws both away. So the shared foundation is a widened trim (plus a cache-key bump), and on top of it two pure modules: `donor/txNote.js` decodes notes, `donor/costRows.js` categorises outgoing payments. `globalStats.js` folds both into the value it already returns, and the panel grows a Note column, two tabs and two header stats.

**Tech Stack:** React 18 (class component at the Home level, function components below), SASS, Jest via react-scripts, Blueprint.js `Tooltip2`.

**Spec:** GitHub issues [#367](https://github.com/2ndtlmining/Fluxnode/issues/367) (Note column) and [#366](https://github.com/2ndtlmining/Fluxnode/issues/366) (Costs tab), plus the four decisions recorded under *Decisions* below.

---

## Global Constraints

- **Costs cover the current `ADDRESS_FLUX` (`t3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr`) only** — never `OLD_ADDRESS_FLUX`. The old address is a node collateral address with 18 pages of unrelated outgoing movement; including it would bury two real expenses under dozens of "Other" rows.
- **Refund matching uses donors to the current t3 address only** (decision 3 below). A refund to a pre-move donor is therefore labelled "Other", by choice.
- **Window is `DONOR_WINDOW_DAYS` (365 days)** for costs, exactly as for donations, so the header's figures describe one period.
- **The tab is called "Costs"** everywhere — never "Expenses", which appears once in issue #366 and is superseded.
- **No new explorer requests.** Every figure here comes from the scan `scanBothDonationAddresses()` already performs. Adding a caller to the explorer would undo #314/#341.
- **The cache key must move `donationScan_v1` → `donationScan_v2`.** A widened trim read back under the old key yields blank notes and an empty Costs tab — a silently wrong answer, which is the exact failure `api/donationScanCache.js` documents.
- **Windows shell note:** run Jest through the Bash tool, not PowerShell — `CI=true` inline assignment is POSIX syntax.
- Avoid unicode arrows in any console/script output; use ASCII (`->`).

## Decisions (already settled — do not re-litigate)

1. **Costs source:** current t3 address only.
2. **Flux Cloud category renders even at zero.** No payments to `t3NryfAQLGeFs9jEoeqsxmBN2QLRaRKFLUX` exist yet; there will be soon. Build the category; do not hide it because it is empty.
3. **Refund = recipient has donated to the t3 address.** Project-owned wallets (`EXCLUDED_FROM_DONATION_TOTALS`) are *not* donors, so paying one is "Other".
4. **Header band uses two stat columns**, not five stacked rows: `Supporters / Donations / Most recent` on the left, `Costs / Refunds` on the right.

## Measured facts this plan relies on

Verified live against `explorer.runonflux.io` on 2026-09-16. Cited so nobody re-derives them.

- `t3YcVbiQ…` has **4 pages / 40 transactions**: 38 incoming, **2 outgoing**, 29 distinct donor addresses.
- The 2 outgoing: `58add1fd…` pays 23 FLUX to `t1XNTegMCLrmRWKzKQwRM8H15arLDzox74g` (note *"thanks for the help"*) → **Other**; `fa6b4c33…` pays 189 FLUX to `t1JprekhQLq2GXBuonotzt88ukNj5LRv8dF`, who donated 100 FLUX in `1eaab08d…` → **Refund**. Both also return change to `t3YcVbiQ…`, which must not be counted.
- **Zero** payments to the Flux Cloud address so far.
- **10 OP_RETURN notes** observed, all single-push printable ASCII, 15–80 bytes. Format is uniformly `OP_RETURN <hex>` in `scriptPubKey.asm`. Parse `asm`, **not** `hex` — the hex field carries variable push opcodes (`6a13`, `6a47`, `6a4c50`) that would need an opcode decoder.
- 80 bytes is the OP_RETURN relay cap, so persisting a decoded note costs the cache at most ~80 bytes per transaction.

## Flagged risk — read before Task 1

A note is **attacker-controlled text rendered on the project's landing page**. `buildDonationRows` has no minimum amount, so anyone can send dust with an abusive note and have it published on Home. All ten notes on record are benign, and the feature is the point of the issue, so this plan **displays notes for all rows** and defends with sanitisation only: reject anything that is not valid UTF-8, strip control characters, collapse whitespace, cap at 80 characters. If this is ever abused, the levers are a minimum-amount threshold for notes or a blocklist — noted in the code so the next person finds them. Raise with the maintainer if that tradeoff is unwelcome *before* building Task 1.

## File Structure

**Create**
- `client/src/donor/txNote.js` — decode + sanitise one transaction's OP_RETURN note. Pure. Used by both the cache trim and the two row builders, which is why it is its own file rather than a helper inside either.
- `client/src/donor/txNote.test.js`
- `client/src/donor/costRows.js` — outgoing-payment rows and their totals. Separate from `donationTotals.js` because that module is about money *in* and this is money *out*, with its own category rules.
- `client/src/donor/costRows.test.js`

**Modify**
- `client/src/donor/config.js` — add `FLUX_CLOUD_ADDRESSES`.
- `client/src/donor/donationTotals.js` — export `senderOf`; add `note` to donation rows.
- `client/src/donor/donationTotals.test.js` — cover `note`.
- `client/src/api/donationScanCache.js` — trim keeps notes and outgoing recipients; key → v2.
- `client/src/api/donationScanCache.test.js` — cover both.
- `client/src/api/globalStats.js` — `donationTotalsFrom` also returns `costRows` and `costs`.
- `client/src/home/Home.jsx` — carry the two new values into state.
- `client/src/home/HomeOverview/index.jsx` — Note column, tabs, header stats.
- `client/src/home/HomeOverview/index.scss` — 6-column grid, tab strip, two-column stats.

---

### Task 1: Note decoding

**Files:**
- Create: `client/src/donor/txNote.js`
- Test: `client/src/donor/txNote.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `decodeTxNote(tx) -> string | null`, `NOTE_MAX_CHARS = 80`.

- [ ] **Step 1: Write the failing test**

Create `client/src/donor/txNote.test.js`:

```js
import { decodeTxNote, NOTE_MAX_CHARS } from './txNote';

/*
 * Issue #367. Donation notes ride as an OP_RETURN output. Fixtures use the
 * REAL asm shape and the real hex payloads read off the explorer on
 * 2026-09-16, so a change to the parser is checked against what the chain
 * actually returns rather than an idealised version of it.
 */
function txWithAsm(asm) {
  return {
    txid: 'a',
    vout: [
      { value: '10.0', scriptPubKey: { addresses: ['t3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'] } },
      { value: '0.0', scriptPubKey: { asm, addresses: null } }
    ]
  };
}

describe('decodeTxNote', () => {
  it('decodes a real note off the chain', () => {
    // tx 52cd7c6b… -> "2ndTL Flux Dashboard"
    const tx = txWithAsm('OP_RETURN 326e64544c20466c75782044617368626f617264');
    expect(decodeTxNote(tx)).toBe('2ndTL Flux Dashboard');
  });

  it('decodes the longest note on record intact', () => {
    // tx ee5c8f3b… is 80 bytes -- the OP_RETURN relay cap, so nothing on chain
    // can be longer and the cap must not clip a legitimate note.
    const hex =
      '5468616e6b20796f7520666f722074686973206772656174206461707020616e6420746865206861726420776f726b2067657474696e67206974206261636b20757020616e642072756e6e696e672121';
    const note = decodeTxNote(txWithAsm('OP_RETURN ' + hex));
    expect(note).toBe('Thank you for this great dapp and the hard work getting it back up and running!!');
    expect(note.length).toBeLessThanOrEqual(NOTE_MAX_CHARS);
  });

  it('returns null when there is no OP_RETURN output', () => {
    expect(decodeTxNote({ txid: 'a', vout: [{ value: '1', scriptPubKey: { addresses: ['t1x'] } }] })).toBeNull();
  });

  it('returns null for a payload that is not valid UTF-8', () => {
    // A binary protocol marker, not a message. Rendering it as mojibake would
    // put noise on the front page.
    expect(decodeTxNote(txWithAsm('OP_RETURN fffefdfc'))).toBeNull();
  });

  it('strips control characters and collapses whitespace', () => {
    // "a\n\n\tb" -> "a b"
    expect(decodeTxNote(txWithAsm('OP_RETURN 610a0a0962'))).toBe('a b');
  });

  it('returns null for a payload that is only whitespace', () => {
    expect(decodeTxNote(txWithAsm('OP_RETURN 202020'))).toBeNull();
  });

  it('returns null rather than throwing on malformed input', () => {
    expect(decodeTxNote(null)).toBeNull();
    expect(decodeTxNote({})).toBeNull();
    expect(decodeTxNote(txWithAsm('OP_RETURN'))).toBeNull();
    expect(decodeTxNote(txWithAsm('OP_RETURN zzzz'))).toBeNull();
  });

  it('reads a note already decoded onto the transaction by the cache trim', () => {
    // A warm cache read hands back {note} instead of a vout to parse.
    expect(decodeTxNote({ txid: 'a', note: 'thanks for the help', vout: [] })).toBe('thanks for the help');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (Bash tool, from repo root):

```bash
cd client && CI=true npx react-scripts test --watchAll=false txNote
```

Expected: FAIL — `Cannot find module './txNote'`.

- [ ] **Step 3: Write minimal implementation**

Create `client/src/donor/txNote.js`:

```js
/*
 * The note a donor attached to their transaction (issue #367).
 *
 * Notes ride as an OP_RETURN output: a zero-value vout whose scriptPubKey has
 * no addresses and whose asm reads `OP_RETURN <hex>`.
 *
 * PARSE asm, NOT hex. The hex field is the whole script including its push
 * opcode, and the opcode varies with length -- 6a13 (direct push, 19 bytes),
 * 6a47 (71 bytes), 6a4c50 (OP_PUSHDATA1, 80 bytes) were all observed in the
 * ten real notes on record. asm has already split the pushed data out, so
 * reading it costs no opcode decoder and cannot get the boundary wrong.
 *
 * WHAT IS REFUSED, and why this is stricter than it looks. A note is text a
 * stranger chose to publish on the project's landing page: buildDonationRows
 * applies no minimum amount, so dust buys a row. Everything on record is
 * benign and the feature is the point of the issue, so notes are shown -- but
 * anything that is not valid UTF-8, anything carrying control characters, and
 * anything longer than the relay cap is refused or cleaned on the way in. If
 * a note is ever abused rather than merely malformed, the levers are a
 * minimum-amount threshold here or a blocklist; neither is built, because
 * neither is needed yet.
 */

/*
 * The OP_RETURN relay cap on this chain, and so the longest note that can
 * exist. The longest on record is exactly 80 bytes, which is why this is a
 * guard against a malformed payload rather than a display truncation -- the
 * column does its own ellipsis in CSS.
 */
export const NOTE_MAX_CHARS = 80;

/*
 * Hex -> string via percent-decoding, which is a UTF-8 decoder every engine
 * already has. Deliberately NOT TextDecoder: jsdom does not expose it under
 * Jest, and a note parser that works in the browser but not in tests is worse
 * than one that is slightly unusual. decodeURIComponent throws URIError on
 * invalid UTF-8, which is exactly the rejection wanted.
 */
function hexToUtf8(hex) {
  if (typeof hex !== 'string' || hex.length === 0) return null;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  try {
    return decodeURIComponent(hex.replace(/../g, '%$&'));
  } catch {
    // Not valid UTF-8 -- a binary payload, not a message.
    return null;
  }
}

/** Printable, single-spaced, and no longer than the chain allows. */
function sanitise(text) {
  if (typeof text !== 'string') return null;
  const cleaned = text
    // C0 and C1 control characters, plus the replacement character a partial
    // decode can leave behind.
    .replace(/[ --�]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, NOTE_MAX_CHARS);
}

/**
 * The note on this transaction, or null when it has none.
 *
 * Accepts both shapes a caller can hold: a raw explorer transaction, and a
 * trimmed one from the persisted scan, which stores the note already decoded
 * (api/donationScanCache.js) because keeping the script to re-parse would cost
 * the cache far more than the 80 bytes of text.
 *
 * @param {object} tx
 * @returns {string|null}
 */
export function decodeTxNote(tx) {
  if (!tx) return null;

  // Already decoded by the cache trim.
  if (typeof tx.note === 'string') return sanitise(tx.note);

  for (const out of tx.vout || []) {
    const asm = out?.scriptPubKey?.asm;
    if (typeof asm !== 'string' || !asm.startsWith('OP_RETURN')) continue;

    const parts = asm.split(/\s+/);
    if (parts.length < 2) continue;

    const text = hexToUtf8(parts[1]);
    const note = sanitise(text);
    if (note) return note;
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd client && CI=true npx react-scripts test --watchAll=false txNote
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/txNote.js client/src/donor/txNote.test.js
git commit -m "feat(#367): decode donation notes from OP_RETURN outputs"
```

---

### Task 2: Widen the cache trim and bump the key

**Files:**
- Modify: `client/src/api/donationScanCache.js`
- Test: `client/src/api/donationScanCache.test.js`

**Interfaces:**
- Consumes: `decodeTxNote` from Task 1.
- Produces: trimmed transactions that now carry `note` (string, optional) and, on outgoing transactions, **all** addressed outputs. `DONATION_SCAN_CACHE_KEY` is now `'donationScan_v2'`.

- [ ] **Step 1: Write the failing test**

Append to `client/src/api/donationScanCache.test.js`:

```js
/*
 * Issues #366 and #367. The trim previously kept only outputs paying a
 * donation address, which discarded (a) the OP_RETURN note and (b) the
 * recipient of every outgoing payment -- the two things these issues need.
 */
describe('trimTxsForCache: notes and outgoing payments', () => {
  const CLOUD = 't3NryfAQLGeFs9jEoeqsxmBN2QLRaRKFLUX';

  it('keeps the decoded note and drops the script it came from', () => {
    const tx = explorerTx({
      vin: [{ addr: 't1donor' }],
      vout: [
        { value: '10.0', scriptPubKey: { addresses: [DONATION_ADDRESS], hex: 'a914…', asm: 'OP_HASH160 …' } },
        { value: '0.0', scriptPubKey: { addresses: null, asm: 'OP_RETURN 326e64544c20466c75782044617368626f617264' } }
      ]
    });

    const [trimmed] = trimTxsForCache([tx], [DONATION_ADDRESS]);

    expect(trimmed.note).toBe('2ndTL Flux Dashboard');
    // The note is persisted decoded; the script that carried it is not, or the
    // trim would be re-admitting the script hex it exists to remove.
    expect(JSON.stringify(trimmed)).not.toContain('OP_RETURN');
  });

  it('omits note entirely when there is none, rather than storing null', () => {
    const tx = explorerTx({
      vin: [{ addr: 't1donor' }],
      vout: [{ value: '10.0', scriptPubKey: { addresses: [DONATION_ADDRESS] } }]
    });
    expect('note' in trimTxsForCache([tx], [DONATION_ADDRESS])[0]).toBe(false);
  });

  it('keeps every addressed output of an OUTGOING transaction', () => {
    // Sent BY the donation address: the recipient is the whole point, and it
    // pays no donation address, so the old trim deleted it.
    const tx = explorerTx({
      vin: [{ addr: DONATION_ADDRESS }],
      vout: [
        { value: '23.0', scriptPubKey: { addresses: ['t1XNTegMCLrmRWKzKQwRM8H15arLDzox74g'] } },
        { value: '1.99', scriptPubKey: { addresses: [DONATION_ADDRESS] } },
        { value: '0.0', scriptPubKey: { addresses: null, asm: 'OP_RETURN 7468616e6b7320666f72207468652068656c70' } }
      ]
    });

    const [trimmed] = trimTxsForCache([tx], [DONATION_ADDRESS]);

    expect(trimmed.vout).toHaveLength(2); // recipient + change; OP_RETURN is not an output row
    expect(trimmed.vout[0].scriptPubKey.addresses).toEqual(['t1XNTegMCLrmRWKzKQwRM8H15arLDzox74g']);
    expect(trimmed.vout[1].scriptPubKey.addresses).toEqual([DONATION_ADDRESS]);
    expect(trimmed.note).toBe('thanks for the help');
  });

  it('still drops irrelevant outputs of an INCOMING transaction', () => {
    /*
     * The size guard that made this cache viable. OLD_ADDRESS_FLUX is a node
     * collateral address and the largest transaction touching it carries 2,001
     * outputs -- a mining pool paying its roster, of which exactly one is a
     * donation. Widening the trim for outgoing transactions must not widen it
     * for these.
     */
    const vout = [{ value: '5.0', scriptPubKey: { addresses: [OLD_DONATION_ADDRESS] } }];
    for (let i = 0; i < 2000; i++) vout.push({ value: '1.0', scriptPubKey: { addresses: ['t1miner' + i] } });

    const [trimmed] = trimTxsForCache([explorerTx({ vin: [{ addr: 't1pool' }], vout })], [OLD_DONATION_ADDRESS]);

    expect(trimmed.vout).toHaveLength(1);
  });

  it('keeps a cloud payment that pays no donation address', () => {
    const tx = explorerTx({
      vin: [{ addr: DONATION_ADDRESS }],
      vout: [{ value: '50.0', scriptPubKey: { addresses: [CLOUD] } }]
    });
    expect(trimTxsForCache([tx], [DONATION_ADDRESS])[0].vout[0].scriptPubKey.addresses).toEqual([CLOUD]);
  });
});

describe('DONATION_SCAN_CACHE_KEY', () => {
  it('is v2, so entries written by the narrower trim are never read back', () => {
    /*
     * A v1 entry has no notes and no outgoing recipients. Read back under the
     * wider trim it would render an empty Costs tab and a blank Note column --
     * a confident wrong answer that survives reloads, which is the failure this
     * module's header warns about.
     */
    expect(DONATION_SCAN_CACHE_KEY).toBe('donationScan_v2');
  });

  it('evicts the v1 entry on write so it does not sit in storage forever', () => {
    localStorage.setItem('donationScan_v1', JSON.stringify({ scans: [[]], timestamp: Date.now() }));
    writeDonationScanCache([[]]);
    expect(localStorage.getItem('donationScan_v1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd client && CI=true npx react-scripts test --watchAll=false donationScanCache
```

Expected: FAIL — `expected 'donationScan_v2', received 'donationScan_v1'`, plus the note and outgoing-output assertions.

- [ ] **Step 3: Write the implementation**

In `client/src/api/donationScanCache.js`, add the import beside the existing one:

```js
import { donationAddresses } from 'donor/donationTotals';
import { decodeTxNote } from 'donor/txNote';
```

Change the key constant:

```js
/*
 * v2 (#366/#367): the trim now keeps the OP_RETURN note and, on outgoing
 * transactions, every addressed output. A v1 entry has neither, and read back
 * under this trim it would render a blank Note column and an empty Costs tab
 * without erroring -- so the key moves rather than the shape being widened in
 * place.
 */
export const DONATION_SCAN_CACHE_KEY = 'donationScan_v2';
const LEGACY_CACHE_KEYS = ['donationScan_v1'];
```

Replace `trimTx` wholesale:

```js
/** Only what the readers read, and only what they read it for. */
function trimTx(tx, addresses) {
  const vin = Array.isArray(tx?.vin) ? tx.vin : [];
  const vout = Array.isArray(tx?.vout) ? tx.vout : [];

  /*
   * Distinct input addresses, first-occurrence order preserved. senderOf walks
   * vin and returns the first address that is not a donation address, so
   * repeats can never change its answer -- and the largest real transaction
   * here has 33 inputs.
   */
  const seen = new Set();
  const senders = [];
  for (const input of vin) {
    const addr = input?.addr;
    if (seen.has(addr)) continue;
    seen.add(addr);
    senders.push({ addr });
  }

  /*
   * Outgoing transactions keep EVERY addressed output (#366). The recipient is
   * the entire subject of the Costs tab and pays no donation address, so the
   * incoming rule below would delete it; the change leg is kept because
   * buildCostRows must recognise and exclude it rather than guess.
   *
   * This is safe for size in a way the incoming rule is not: the 2,001-output
   * transaction that forced this trim is a mining pool paying its roster INTO
   * a donation address. The project has never sent a batch payment and the two
   * outgoing transactions on record have three outputs between them. If that
   * ever changes, cap here rather than narrowing the rule.
   */
  const isOutgoing = senders.some((s) => addresses.includes(s.addr));
  const keptVout = isOutgoing
    ? vout.filter((v) => (v?.scriptPubKey?.addresses || []).length > 0)
    : /*
       * Incoming: only the outputs that pay a donation address. EVERY one of
       * them is kept -- paidToDonationAddress sums them, so a donation split
       * across two outputs would otherwise be halved. A transaction that pays
       * none keeps its txid with an empty vout: it still exists, and its txid
       * still de-duplicates against the other address's scan.
       */
      vout.filter((v) => (v?.scriptPubKey?.addresses || []).some((a) => addresses.includes(a)));

  const trimmed = {
    txid: tx?.txid,
    time: tx?.time,
    blockheight: tx?.blockheight,
    vin: senders,
    vout: keptVout.map((v) => ({
      value: v?.value,
      scriptPubKey: { addresses: v?.scriptPubKey?.addresses }
    }))
  };

  /*
   * Stored DECODED (#367). Keeping the OP_RETURN script to re-parse later
   * would re-admit exactly the script hex this trim exists to strip, for no
   * gain: the decode is deterministic and the text is capped at 80 bytes by
   * the relay rule. Absent when there is no note, so the common case costs
   * nothing.
   */
  const note = decodeTxNote(tx);
  if (note) trimmed.note = note;

  return trimmed;
}
```

In `writeDonationScanCache`, inside the existing `try` block and before the `setItem` call:

```js
    // A v1 entry is unreadable now and is pure dead weight in a storage
    // budget this module already fights for.
    for (const key of LEGACY_CACHE_KEYS) localStorage.removeItem(key);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && CI=true npx react-scripts test --watchAll=false donationScan
```

Expected: PASS — `donationScanCache`, `donationScan` and `donationScanRevalidate` suites all green. The existing trim tests must still pass unchanged; if one fails, the incoming rule was altered and should not have been.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/donationScanCache.js client/src/api/donationScanCache.test.js
git commit -m "feat(#366,#367): keep notes and outgoing recipients in the donation scan cache"
```

---

### Task 3: Put the note on donation rows

**Files:**
- Modify: `client/src/donor/donationTotals.js`
- Test: `client/src/donor/donationTotals.test.js`

**Interfaces:**
- Consumes: `decodeTxNote` from Task 1.
- Produces: `senderOf(tx, addresses) -> string | null` is now **exported**; every row from `buildDonationRows` carries `note: string | null`.

- [ ] **Step 1: Write the failing test**

Append to `client/src/donor/donationTotals.test.js`:

```js
import { buildDonationRows, senderOf } from './donationTotals';

describe('buildDonationRows: notes (#367)', () => {
  function txWithNote({ txid, from, amount, daysAgo, asm }) {
    const vout = [{ value: String(amount), scriptPubKey: { addresses: [DONATION_ADDR] } }];
    if (asm) vout.push({ value: '0', scriptPubKey: { addresses: null, asm } });
    return { txid, time: sec(daysAgo), blockheight: 2_950_000, vin: [{ addr: from }], vout };
  }

  it('carries the decoded note onto the row', () => {
    const [row] = buildDonationRows(
      [txWithNote({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1, asm: 'OP_RETURN 676f6f6420776f726b206d61746521' })],
      { nowMs: NOW }
    );
    expect(row.note).toBe('good work mate!');
  });

  it('sets note to null when the donation carried none', () => {
    const [row] = buildDonationRows([txWithNote({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1 })], { nowMs: NOW });
    expect(row.note).toBeNull();
  });

  it('does not let a note change the amount', () => {
    // The OP_RETURN output pays 0 to nobody. Summing it into the donation
    // would be harmless today and wrong the moment a note rides a real output.
    const [row] = buildDonationRows(
      [txWithNote({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1, asm: 'OP_RETURN 616263' })],
      { nowMs: NOW }
    );
    expect(row.amount).toBe(10);
  });
});

describe('senderOf', () => {
  it('skips donation-address inputs so a refund is never credited as a donation', () => {
    const tx = { vin: [{ addr: DONATION_ADDR }, { addr: 't1alice' }] };
    expect(senderOf(tx, [DONATION_ADDR])).toBe('t1alice');
  });

  it('returns null when every input is a donation address', () => {
    expect(senderOf({ vin: [{ addr: DONATION_ADDR }] }, [DONATION_ADDR])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd client && CI=true npx react-scripts test --watchAll=false donationTotals
```

Expected: FAIL — `senderOf is not a function`, and `row.note` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `client/src/donor/donationTotals.js`, add the import at the top:

```js
import { decodeTxNote } from './txNote';
```

Export `senderOf` by adding `export` to its existing declaration, and extend its comment:

```js
/*
 * Who sent it. Inputs belonging to a donation address are skipped so a
 * consolidation or refund from the project's own address is never credited as
 * an incoming donation.
 *
 * Exported for donor/costRows.js (#366), which needs the same answer to decide
 * who has donated before. Shared rather than reimplemented: if the two drifted,
 * the Costs tab would disagree with the Donations tab about who a donor is.
 */
export function senderOf(tx, addresses) {
```

In `buildDonationRows`, add one field to the pushed row, after `timeSec`:

```js
      timeSec: tx.time,
      /*
       * The note the donor attached (#367). Null far more often than not --
       * 8 of 40 transactions on the current address carry one.
       */
      note: decodeTxNote(tx),
      isProjectTransfer: projectWallets.has(from)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && CI=true npx react-scripts test --watchAll=false "donationTotals|totalDonations"
```

Expected: PASS. The existing row tests must be untouched — `note` is additive.

- [ ] **Step 5: Commit**

```bash
git add client/src/donor/donationTotals.js client/src/donor/donationTotals.test.js
git commit -m "feat(#367): carry the donation note onto each row"
```

---

### Task 4: Cost rows and totals

**Files:**
- Create: `client/src/donor/costRows.js`
- Modify: `client/src/donor/config.js`
- Test: `client/src/donor/costRows.test.js`

**Interfaces:**
- Consumes: `senderOf` (Task 3), `decodeTxNote` (Task 1), `DONOR_WINDOW_DAYS` and `EXCLUDED_FROM_DONATION_TOTALS` from `donor/config`.
- Produces:
  - `FLUX_CLOUD_ADDRESSES: string[]` from `donor/config`.
  - `buildCostRows(txs, { nowMs?, sourceAddress? }) -> CostRow[]`, sorted by block height descending, where
    `CostRow = { key: string, txid: string, to: string, amount: number, category: 'cloud'|'refund'|'other', note: string|null, blockHeight: number, timeSec: number }`
    and `key` is `` `${txid}:${voutIndex}` ``.
  - `aggregateCosts(rows) -> { costFlux: number, refundFlux: number, cloudFlux: number, otherFlux: number, costCount: number, refundCount: number, rowCount: number }`.
  - `COST_CATEGORY_LABELS: { cloud: 'Flux Cloud', refund: 'Refund', other: 'Other' }`.

- [ ] **Step 1: Add the Flux Cloud address to config**

In `client/src/donor/config.js`, append:

```js
/*
 * Flux Cloud, where the project's hosting is paid (issue #366).
 *
 * A LIST rather than a constant because there is every reason to expect a
 * second one: this is a payment endpoint, not an identity. As of 2026-09-16
 * the donation address has sent it nothing -- the category is built and shown
 * at zero because payments are expected shortly, not because the data is
 * there. An empty category that appears the day it is first used is better
 * than a reader wondering where hosting costs went.
 */
export const FLUX_CLOUD_ADDRESSES = ['t3NryfAQLGeFs9jEoeqsxmBN2QLRaRKFLUX'];
```

- [ ] **Step 2: Write the failing test**

Create `client/src/donor/costRows.test.js`:

```js
import { buildCostRows, aggregateCosts, COST_CATEGORY_LABELS } from './costRows';
import { FLUX_CLOUD_ADDRESSES } from './config';

/*
 * Issue #366 -- what the donation address SPENDS, categorised.
 *
 * The fixtures below are the two real outgoing transactions on
 * t3YcVbiQ… as of 2026-09-16, plus the donation that makes one of them a
 * refund. Using the real shapes matters: both carry a change leg back to the
 * donation address, and counting change as an expense would roughly double
 * the headline cost figure.
 */
const DONATION_ADDR = 't3YcVbiQWHerVYHKBccAQGUmSWDdKu9Zjrr'; // setupTests.js
const CLOUD = FLUX_CLOUD_ADDRESSES[0];
const NOW = 1789600000000;
const DAY = 24 * 3600;
const sec = (daysAgo) => Math.floor(NOW / 1000) - daysAgo * DAY;

function incoming({ txid, from, amount, daysAgo }) {
  return {
    txid,
    time: sec(daysAgo),
    blockheight: 2_946_455,
    vin: [{ addr: from }],
    vout: [{ value: String(amount), scriptPubKey: { addresses: [DONATION_ADDR] } }]
  };
}

function outgoing({ txid, to, amount, change = 0, daysAgo, blockheight = 2_952_400, asm }) {
  const vout = [{ value: String(amount), scriptPubKey: { addresses: [to] } }];
  if (change) vout.push({ value: String(change), scriptPubKey: { addresses: [DONATION_ADDR] } });
  if (asm) vout.push({ value: '0', scriptPubKey: { addresses: null, asm } });
  return { txid, time: sec(daysAgo), blockheight, vin: [{ addr: DONATION_ADDR }], vout };
}

describe('buildCostRows', () => {
  it('ignores incoming transactions entirely', () => {
    expect(buildCostRows([incoming({ txid: 'a', from: 't1alice', amount: 10, daysAgo: 1 })], { nowMs: NOW })).toEqual([]);
  });

  it('excludes the change leg returning to the donation address', () => {
    // tx 58add1fd…: 23 out, 1.99 back as change. The expense is 23, not 24.99.
    const rows = buildCostRows([outgoing({ txid: 'a', to: 't1XNTeg', amount: 23, change: 1.99, daysAgo: 1 })], { nowMs: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(23);
  });

  it('labels a payment to Flux Cloud as cloud', () => {
    const rows = buildCostRows([outgoing({ txid: 'a', to: CLOUD, amount: 50, daysAgo: 1 })], { nowMs: NOW });
    expect(rows[0].category).toBe('cloud');
  });

  it('labels a payment to a prior donor as a refund', () => {
    // tx fa6b4c33… pays 189 back to t1Jprekh…, who donated 100 in 1eaab08d…
    const rows = buildCostRows(
      [
        incoming({ txid: 'in', from: 't1Jprekh', amount: 100, daysAgo: 10 }),
        outgoing({ txid: 'out', to: 't1Jprekh', amount: 189, change: 10.99, daysAgo: 9 })
      ],
      { nowMs: NOW }
    );
    const refund = rows.find((r) => r.txid === 'out');
    expect(refund.category).toBe('refund');
    expect(refund.amount).toBe(189);
  });

  it('labels everything else as other', () => {
    const rows = buildCostRows([outgoing({ txid: 'a', to: 't1XNTeg', amount: 23, daysAgo: 1 })], { nowMs: NOW });
    expect(rows[0].category).toBe('other');
  });

  it('does not treat a project-owned wallet as a donor', () => {
    // EXCLUDED_FROM_DONATION_TOTALS wallets are not donors, so paying one back
    // is a transfer, not a refund.
    const rows = buildCostRows(
      [
        incoming({ txid: 'in', from: 't1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh', amount: 500, daysAgo: 10 }),
        outgoing({ txid: 'out', to: 't1gesjNJGfzU8shfMZj6DVDatRKA3LQj8Nh', amount: 500, daysAgo: 9 })
      ],
      { nowMs: NOW }
    );
    expect(rows.find((r) => r.txid === 'out').category).toBe('other');
  });

  it('only counts donors of the source address, not of the old address', () => {
    /*
     * Decision on #366: refunds match donors of t3YcVbiQ… only. A donation to
     * OLD_ADDRESS_FLUX arrives in the same scan and must NOT make its sender a
     * refund recipient here.
     */
    const oldAddrDonation = {
      txid: 'old',
      time: sec(20),
      blockheight: 2_900_000,
      vin: [{ addr: 't1bob' }],
      vout: [{ value: '50', scriptPubKey: { addresses: ['t1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG'] } }]
    };
    const rows = buildCostRows([oldAddrDonation, outgoing({ txid: 'out', to: 't1bob', amount: 50, daysAgo: 1 })], { nowMs: NOW });
    expect(rows.find((r) => r.txid === 'out').category).toBe('other');
  });

  it('ignores transactions sent by the OLD address', () => {
    // The old address is node collateral with 18 pages of unrelated movement.
    const fromOld = {
      txid: 'old',
      time: sec(1),
      blockheight: 2_950_000,
      vin: [{ addr: 't1ebxupkNYVQiswfwi7xBTwwKtioJqwLmUG' }],
      vout: [{ value: '99', scriptPubKey: { addresses: ['t3UmJKLz'] } }]
    };
    expect(buildCostRows([fromOld], { nowMs: NOW })).toEqual([]);
  });

  it('drops payments older than the 365-day window', () => {
    expect(buildCostRows([outgoing({ txid: 'a', to: 't1x', amount: 5, daysAgo: 400 })], { nowMs: NOW })).toEqual([]);
  });

  it('carries the note and gives one row per recipient', () => {
    const rows = buildCostRows(
      [
        outgoing({
          txid: 'a',
          to: 't1XNTeg',
          amount: 23,
          change: 1.99,
          daysAgo: 1,
          asm: 'OP_RETURN 7468616e6b7320666f72207468652068656c70'
        })
      ],
      { nowMs: NOW }
    );
    expect(rows[0].note).toBe('thanks for the help');
    expect(rows[0].key).toBe('a:0');
  });

  it('de-duplicates a transaction that arrives from both address scans', () => {
    const tx = outgoing({ txid: 'a', to: 't1x', amount: 5, daysAgo: 1 });
    expect(buildCostRows([tx, tx], { nowMs: NOW })).toHaveLength(1);
  });

  it('sorts by block height, latest first', () => {
    const rows = buildCostRows(
      [
        outgoing({ txid: 'old', to: 't1x', amount: 1, daysAgo: 5, blockheight: 2_900_000 }),
        outgoing({ txid: 'new', to: 't1y', amount: 1, daysAgo: 1, blockheight: 2_950_000 })
      ],
      { nowMs: NOW }
    );
    expect(rows.map((r) => r.txid)).toEqual(['new', 'old']);
  });
});

describe('aggregateCosts', () => {
  it('counts cloud and other as cost, and refunds separately', () => {
    /*
     * Per #366: "Cost (sum of all payments made from donation … to Flux cloud
     * … and the Other category)" and "Refund (sum of refunds to donor)". A
     * refund is money returned, not money spent, so it must not inflate Cost.
     */
    const totals = aggregateCosts([
      { amount: 50, category: 'cloud' },
      { amount: 23, category: 'other' },
      { amount: 189, category: 'refund' }
    ]);
    expect(totals.cloudFlux).toBe(50);
    expect(totals.otherFlux).toBe(23);
    expect(totals.costFlux).toBe(73);
    expect(totals.refundFlux).toBe(189);
    expect(totals.costCount).toBe(2);
    expect(totals.refundCount).toBe(1);
    expect(totals.rowCount).toBe(3);
  });

  it('is all zeros for an empty list', () => {
    expect(aggregateCosts([])).toEqual({
      costFlux: 0,
      refundFlux: 0,
      cloudFlux: 0,
      otherFlux: 0,
      costCount: 0,
      refundCount: 0,
      rowCount: 0
    });
  });

  it('rounds so floating point cannot reach the screen', () => {
    expect(aggregateCosts([{ amount: 0.1, category: 'other' }, { amount: 0.2, category: 'other' }]).costFlux).toBe(0.3);
  });
});

describe('COST_CATEGORY_LABELS', () => {
  it('labels every category a row can carry', () => {
    expect(COST_CATEGORY_LABELS).toEqual({ cloud: 'Flux Cloud', refund: 'Refund', other: 'Other' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd client && CI=true npx react-scripts test --watchAll=false costRows
```

Expected: FAIL — `Cannot find module './costRows'`.

- [ ] **Step 4: Write the implementation**

Create `client/src/donor/costRows.js`:

```js
import { DONOR_WINDOW_DAYS, EXCLUDED_FROM_DONATION_TOTALS, FLUX_CLOUD_ADDRESSES } from './config';
import { senderOf } from './donationTotals';
import { decodeTxNote } from './txNote';

/*
 * What the donation address SPENDS, categorised (issue #366).
 *
 * The counterpart to donationTotals.js, and deliberately a separate module:
 * that one answers "what has the community given", this one answers "what has
 * the project done with it". They read the SAME bytes -- the scan
 * scanBothDonationAddresses already performs -- so this costs no explorer
 * traffic, which given #314 and #341 is the constraint that matters most here.
 *
 * SCOPE: the CURRENT donation address only, never OLD_ADDRESS_FLUX. The old
 * address is a node collateral address carrying 18 pages of history whose
 * outgoing transactions are unrelated movement -- node payouts and exchange
 * deposits. Categorising those as project expenses would be false, and
 * labelling them "Other" would bury the two real expenses under noise. The old
 * address's transactions still arrive in the scan; they are filtered out here.
 */

const WINDOW_SEC = DONOR_WINDOW_DAYS * 24 * 60 * 60;

export const COST_CATEGORY_LABELS = {
  cloud: 'Flux Cloud',
  refund: 'Refund',
  other: 'Other'
};

/** The address costs are measured from. Read at call time -- see donationAddresses. */
function currentDonationAddress() {
  return (typeof window !== 'undefined' && window.gContent?.ADDRESS_FLUX) || null;
}

/*
 * Everyone who has donated to the source address.
 *
 * Used for the "Donation Refund" label: paying back someone who gave is a
 * refund, paying anyone else is not.
 *
 * DONORS OF THE SOURCE ADDRESS ONLY. Donations to OLD_ADDRESS_FLUX arrive in
 * the same scan and are deliberately not counted, per the decision recorded on
 * #366. The consequence is real and accepted: someone who donated before the
 * 2026-09-12 move and is refunded after it reads as "Other". The alternative
 * pulled a second address's donor list into a tab that is otherwise strictly
 * about one address.
 *
 * Project-owned wallets are excluded for a different reason -- they are not
 * donors at all (see EXCLUDED_FROM_DONATION_TOTALS), so money going back to
 * one is a transfer, not a refund.
 */
function donorsOf(txs, sourceAddress) {
  const projectWallets = new Set(EXCLUDED_FROM_DONATION_TOTALS);
  const donors = new Set();

  for (const tx of txs) {
    const paysSource = (tx?.vout || []).some((out) =>
      (out?.scriptPubKey?.addresses || []).includes(sourceAddress)
    );
    if (!paysSource) continue;

    const from = senderOf(tx, [sourceAddress]);
    if (from && !projectWallets.has(from)) donors.add(from);
  }

  return donors;
}

function categorise(to, donors) {
  if (FLUX_CLOUD_ADDRESSES.includes(to)) return 'cloud';
  if (donors.has(to)) return 'refund';
  return 'other';
}

/**
 * One row per payment out of the donation address, latest block first.
 *
 * A row is one OUTPUT, not one transaction: a single transaction can pay a
 * hosting bill and refund someone in the same breath, and those are two
 * different categories that cannot share a row.
 *
 * @param {Array<object>} txs  the flattened scan, both addresses
 * @param {{ nowMs?: number, sourceAddress?: string }} [options]
 * @returns {Array<{key: string, txid: string, to: string, amount: number,
 *   category: 'cloud'|'refund'|'other', note: string|null,
 *   blockHeight: number, timeSec: number}>}
 */
export function buildCostRows(txs, { nowMs = Date.now(), sourceAddress } = {}) {
  if (!Array.isArray(txs)) return [];

  const source = sourceAddress || currentDonationAddress();
  if (!source) return [];

  const cutoffSec = Math.floor(nowMs / 1000) - WINDOW_SEC;
  const donors = donorsOf(txs, source);

  const seen = new Set();
  const rows = [];

  for (const tx of txs) {
    if (!tx?.txid || seen.has(tx.txid)) continue;
    if (typeof tx.time !== 'number' || tx.time < cutoffSec) continue;

    // Outgoing means the source address funded it.
    const sentBySource = (tx.vin || []).some((input) => input?.addr === source);
    if (!sentBySource) continue;

    seen.add(tx.txid);
    const note = decodeTxNote(tx);

    (tx.vout || []).forEach((out, index) => {
      const to = (out?.scriptPubKey?.addresses || [])[0];

      // No address: the OP_RETURN carrying the note. It pays nobody and is
      // already represented by `note`.
      if (!to) return;

      /*
       * Change. A 23 FLUX payment funded by a 25 FLUX input returns the
       * remainder to the source address in the same transaction; counting it
       * would roughly double the headline cost figure on the two real
       * transactions on record.
       */
      if (to === source) return;

      const amount = Number(out.value) || 0;
      if (amount <= 0) return;

      rows.push({
        key: `${tx.txid}:${index}`,
        txid: tx.txid,
        to,
        // Rounded for the same reason the donation total is: binary floating
        // point must not put 0.30000000000000004 on the front page.
        amount: Math.round(amount * 1e8) / 1e8,
        category: categorise(to, donors),
        note,
        blockHeight: tx.blockheight || 0,
        timeSec: tx.time
      });
    });
  }

  return rows.sort((a, b) => b.blockHeight - a.blockHeight);
}

/**
 * The header figures for the Community Support band.
 *
 * Cost is cloud + other; a refund is money RETURNED, not money spent, and
 * folding it into cost would overstate what running the project costs by an
 * order of magnitude on the data as it stands.
 *
 * @param {Array<{amount: number, category: string}>} rows
 */
export function aggregateCosts(rows) {
  const totals = {
    costFlux: 0,
    refundFlux: 0,
    cloudFlux: 0,
    otherFlux: 0,
    costCount: 0,
    refundCount: 0,
    rowCount: 0
  };
  if (!Array.isArray(rows)) return totals;

  for (const row of rows) {
    const amount = Number(row?.amount) || 0;
    totals.rowCount += 1;

    if (row?.category === 'refund') {
      totals.refundFlux += amount;
      totals.refundCount += 1;
      continue;
    }

    if (row?.category === 'cloud') totals.cloudFlux += amount;
    else totals.otherFlux += amount;

    totals.costFlux += amount;
    totals.costCount += 1;
  }

  const round = (n) => Math.round(n * 1e8) / 1e8;
  totals.costFlux = round(totals.costFlux);
  totals.refundFlux = round(totals.refundFlux);
  totals.cloudFlux = round(totals.cloudFlux);
  totals.otherFlux = round(totals.otherFlux);

  return totals;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd client && CI=true npx react-scripts test --watchAll=false costRows
```

Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add client/src/donor/costRows.js client/src/donor/costRows.test.js client/src/donor/config.js
git commit -m "feat(#366): categorise payments out of the donation address"
```

---

### Task 5: Wire costs through the data layer

**Files:**
- Modify: `client/src/api/globalStats.js:386-406` (the `donationTotalsFrom` helper)
- Modify: `client/src/home/Home.jsx:78-92` (state) and `:277-299` (the fetch)
- Test: `client/src/api/donationScan.test.js`

**Interfaces:**
- Consumes: `buildCostRows`, `aggregateCosts` (Task 4).
- Produces: `fetch_donation_totals` resolves (and calls `onRefresh`) with `{ ok, totals, rows, costRows, costs, status, fetchedAt }`. Home state gains `costRows: []` and `costs: null`.

- [ ] **Step 1: Write the failing test**

Append to `client/src/api/donationScan.test.js`:

```js
/*
 * Issue #366. Costs ride along on the scan that donations already pay for --
 * the same argument #315 made for the donation list. A separate fetch would
 * add a fifth caller to an explorer that #314 was raised about.
 */
describe('fetch_donation_totals: costs (#366)', () => {
  it('returns cost rows and totals from the same scan', async () => {
    const result = await fetch_donation_totals();

    expect(Array.isArray(result.costRows)).toBe(true);
    expect(result.costs).toEqual(
      expect.objectContaining({
        costFlux: expect.any(Number),
        refundFlux: expect.any(Number),
        rowCount: expect.any(Number)
      })
    );
  });

  it('reports zero costs rather than null when the scan is unreadable', async () => {
    // A failed scan must not put `undefined FLUX` in the header band.
    const result = await fetchWithBothAddressesFailing();
    expect(result.ok).toBe(false);
    expect(result.costRows).toEqual([]);
    expect(result.costs.costFlux).toBe(0);
  });
});
```

> The existing suite already has helpers for mocking the explorer; reuse them. If `fetchWithBothAddressesFailing` does not exist under that name, use whatever the file's existing "both addresses unreadable" test uses and keep the two assertions.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd client && CI=true npx react-scripts test --watchAll=false donationScan
```

Expected: FAIL — `result.costRows` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `client/src/api/globalStats.js`, extend the import block:

```js
import { aggregateDonations, buildDonationRows } from 'donor/donationTotals';
import { buildCostRows, aggregateCosts } from 'donor/costRows';
```

Replace `donationTotalsFrom` with:

```js
/** The shared reduction, so the cached and live passes cannot compute differently. */
function donationTotalsFrom(scans, status, fetchedAt) {
  if (!Array.isArray(scans) || scans.every((txs) => txs === null)) {
    /*
     * Costs are zeroed rather than nulled even on failure: the panel reads
     * `ok` to decide whether to render at all, and a null here would put
     * "undefined FLUX" in the header band if that ever changed.
     */
    return { ok: false, totals: null, rows: [], costRows: [], costs: aggregateCosts([]), status, fetchedAt };
  }

  const txs = scans.filter(Boolean).flat();
  /*
   * Rows are rebuilt here, never cached (#341). buildDonationRows applies a
   * ROLLING window against nowMs; persisting derived rows would freeze that
   * window and keep listing donations that have since aged out of it. The
   * cache stores transactions precisely so this stays live. buildCostRows
   * applies the same window and is rebuilt for the same reason.
   */
  const costRows = buildCostRows(txs);

  return {
    ok: true,
    totals: aggregateDonations(txs),
    rows: buildDonationRows(txs),
    /*
     * Costs ride along on this scan rather than fetching their own (#366),
     * exactly as the donation rows do -- the outgoing transactions were
     * always in these bytes and were being skipped.
     */
    costRows,
    costs: aggregateCosts(costRows),
    status,
    fetchedAt
  };
}
```

In `client/src/home/Home.jsx`, add to the initial state beside `donationRows`:

```js
      donationRows: [],
      // #366: what the donation address has spent, from the same scan.
      costRows: [],
      costs: null,
```

And in both `setState` calls inside the `fetch_donation_totals` block, destructure and pass the two new values. The `onRefresh` callback becomes:

```js
      onRefresh: ({ ok, totals, rows, costRows, costs, status }) => {
        if (this._unmounted) return;
        this.setState({
          donations: totals,
          donationRows: rows || [],
          costRows: costRows || [],
          costs: costs || null,
          donationsSettled: true,
          donationsFailed: !ok,
          donationsStatus: status
        });
      }
```

and the `.then` becomes:

```js
      .then(({ ok, totals, rows, costRows, costs, status, fetchedAt }) =>
        this.setState({
          donations: totals,
          donationRows: rows || [],
          costRows: costRows || [],
          costs: costs || null,
          donationsSettled: true,
          donationsFailed: !ok,
          donationsStatus: status,
          donationsFetchedAt: fetchedAt
        })
      )
```

Finally, pass both down where `HomeOverview` is rendered — find the existing `donationRows={...}` prop and add `costRows={this.state.costRows}` and `costs={this.state.costs}` beside it.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd client && CI=true npx react-scripts test --watchAll=false "donationScan|apidataParity"
```

Expected: PASS. `apidataParity` must stay green — the baseline records only `fetch_donation_totals`' signature (`{type, length: 0, name}`), not its return shape, so widening the result needs no fixture edit. **If it fails, do not regenerate the fixture** — hand-edit `api/__fixtures__/apidataBaseline.json`.

- [ ] **Step 5: Commit**

```bash
git add client/src/api/globalStats.js client/src/home/Home.jsx client/src/api/donationScan.test.js
git commit -m "feat(#366): carry cost rows and totals through fetch_donation_totals"
```

---

### Task 6: The Note column (closes #367)

**Files:**
- Modify: `client/src/home/HomeOverview/index.jsx:117-222` (`DonationList`)
- Modify: `client/src/home/HomeOverview/index.scss:957-967` (the row grid)

**Interfaces:**
- Consumes: `note` on each donation row (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the column to the grid**

In `client/src/home/HomeOverview/index.scss`, replace the `grid-template-columns` line inside `.hov-donations-row`:

```scss
  /* Donor and transaction get the room; the three numeric columns are fixed
     so they line up as columns rather than drifting with content width. */
  /* #322 shortened both identifiers, so these no longer need to flex wide. */
  /* #367 added Note between Transaction and Amount. It takes the largest
     flexible share because it is the only column with prose in it, and it
     ellipsises rather than wrapping so a long note cannot change row height. */
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 0.6fr) minmax(0, 1fr) 92px 92px 100px;
```

And add, after the `.hov-donations-row--header` block:

```scss
.hov-donations-note {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-style: italic;
}

/* An empty cell would leave the row looking broken rather than noteless. */
.hov-donations-note--empty {
  color: var(--text-tertiary);
  font-style: normal;
}
```

- [ ] **Step 2: Render the column**

In `client/src/home/HomeOverview/index.jsx`, add a header cell to the header row between `Transaction` and `Amount`:

```jsx
        <span>Transaction</span>
        <span>Note</span>
        <button type="button" className="hov-num" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
```

Add the cell to each rendered row, between the transaction and amount cells:

```jsx
              <span className="hov-donations-tx">{shortId(r.txid, 4, 4)}</span>
              {/*
                #367. The note is shown in full on hover, which is a deliberate
                exception to #322 rather than an oversight: #322 removed
                tooltips carrying a full ADDRESS or TXID, because a shortened
                identifier with the whole value in an attribute republishes
                exactly what the shortening withholds. A note is not an
                identifier -- it is text the donor chose to write into a public
                transaction, and there is nothing to withhold. donor/txNote.js
                caps and sanitises it on the way in.
              */}
              {r.note ? (
                <Tooltip2 content={r.note} placement="top" hoverOpenDelay={200}>
                  <span className="hov-donations-note">{r.note}</span>
                </Tooltip2>
              ) : (
                <span className="hov-donations-note hov-donations-note--empty">&mdash;</span>
              )}
              <span className="hov-num hov-donations-amount">{fmtNum(r.amount, 2)}</span>
```

Extend the search predicate and its placeholder, replacing the `filtered` block:

```jsx
  /*
   * Wallet, amount and note -- deliberately NOT txid (#322).
   *
   * It used to match txid too, which was defensible while the full id was on
   * screen. It is not now: searching "45" would return a 10 FLUX donation whose
   * transaction id happens to contain "45", and with the id no longer readable
   * there is nothing on the row to explain the match. A search that returns
   * rows the reader cannot connect to their query reads as a bug, so the
   * predicate matches the placeholder.
   *
   * The note is included for exactly that reason and not in spite of it: it IS
   * readable on the row, so a match is always explainable (#367).
   */
  const filtered = q
    ? rows.filter(
        (r) =>
          r.from.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          (r.note || '').toLowerCase().includes(q)
      )
    : rows;
```

and:

```jsx
          placeholder="Search wallet, amount or note"
          aria-label="Search donations by wallet, amount or note"
```

- [ ] **Step 3: Verify in the running app**

```bash
docker build -t fluxnode:qa .
docker run -d --name fluxnode-qa -p 9000:80 -v fluxnode-qa-data:/app/data -e TESTING=true fluxnode:qa
```

Open `localhost:9000/#/home`. **Clear localStorage first** (`localStorage.clear()` in the console) so the v1 entry cannot mask the change.

Expected: the Donations list shows a Note column between Transaction and Amount. Roughly 8 rows in 40 carry text; the rest show an em dash. Confirm at least one of these exact notes appears: *"2ndTL Flux Dashboard"*, *"donation for fluxnodes.app"*, *"good work mate!"*, *"Thanks for a great app!"*. Hovering a long note (*"Thank you for all the hard work getting your dapp back up and running!!"*) shows it in full. No row is taller than its neighbours.

- [ ] **Step 4: Run the full suite and build**

```bash
cd client && CI=true npx react-scripts test --watchAll=false && yarn build
```

Expected: both green. Per CLAUDE.md, a green suite is not a green build — run both.

- [ ] **Step 5: Commit**

```bash
git add client/src/home/HomeOverview/index.jsx client/src/home/HomeOverview/index.scss
git commit -m "feat(#367): show the donation note, with the full text on hover

Closes #367"
```

---

### Task 7: Tabs, the Costs list and the header stats (closes #366)

**Files:**
- Modify: `client/src/home/HomeOverview/index.jsx:233-315` (`CommunitySupportPanel`) and the section above it
- Modify: `client/src/home/HomeOverview/index.scss:616+` (the Community Support block)

**Interfaces:**
- Consumes: `costRows`, `costs` props (Task 5); `COST_CATEGORY_LABELS` (Task 4).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Build the Costs list**

In `client/src/home/HomeOverview/index.jsx`, add to the imports:

```js
import { COST_CATEGORY_LABELS } from 'donor/costRows';
```

Add a `CostList` component immediately after `DonationList`:

```jsx
/*
 * What the donation address has spent (issue #366).
 *
 * Structurally identical to DonationList on purpose -- same six columns, same
 * widths, same search and sort affordances -- so switching tabs moves the
 * reader between two views of one ledger rather than between two different
 * tables. The category rides as a tag on the recipient rather than taking a
 * column of its own, reusing the styling the "project" tag already uses.
 *
 * Categories come from donor/costRows.js. Flux Cloud is expected to be EMPTY
 * for now: no hosting payment has been made from this address yet. That is why
 * the totals below name the category even at zero instead of hiding it.
 */
const COST_SORTS = {
  block: { label: 'Block', get: (r) => r.blockHeight },
  amount: { label: 'Amount', get: (r) => r.amount },
  to: { label: 'To', get: (r) => r.to },
};

function CostList({ rows, costs }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('block');
  const [ascending, setAscending] = useState(false);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.to.toLowerCase().includes(q) ||
          String(r.amount).includes(q) ||
          (r.note || '').toLowerCase().includes(q) ||
          COST_CATEGORY_LABELS[r.category].toLowerCase().includes(q)
      )
    : rows;

  const get = COST_SORTS[sortKey].get;
  const sorted = [...filtered].sort((a, b) => {
    const av = get(a);
    const bv = get(b);
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return ascending ? cmp : -cmp;
  });

  const toggleSort = (key) => {
    if (key === sortKey) {
      setAscending((prev) => !prev);
    } else {
      setSortKey(key);
      setAscending(key === 'to');
    }
  };

  const arrow = (key) => (key === sortKey ? (ascending ? ' ↑' : ' ↓') : '');

  return (
    <div className="hov-donations">
      <div className="hov-donations-head">
        {/*
          The breakdown lives here rather than in the header band, which
          carries only the two figures #366 asked for. Flux Cloud is named even
          at 0 FLUX: a category that appears only once it has data leaves a
          reader wondering where hosting costs went.
        */}
        <span className="hov-costs-breakdown">
          <span><b>{fmtNum(costs?.cloudFlux || 0, 2)}</b> Flux Cloud</span>
          <span><b>{fmtNum(costs?.otherFlux || 0, 2)}</b> other</span>
          <span><b>{fmtNum(costs?.refundFlux || 0, 2)}</b> refunded</span>
        </span>
        <input
          className="hov-donations-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, amount or note"
          aria-label="Search costs by address, amount or note"
        />
      </div>

      <div className="hov-donations-row hov-donations-row--header">
        <button type="button" onClick={() => toggleSort('to')}>To{arrow('to')}</button>
        <span>Transaction</span>
        <span>Note</span>
        <button type="button" className="hov-num" onClick={() => toggleSort('amount')}>Amount{arrow('amount')}</button>
        <button type="button" className="hov-num" onClick={() => toggleSort('block')}>Block{arrow('block')}</button>
        <span className="hov-num">When</span>
      </div>

      <div className="hov-donations-list">
        {sorted.length === 0 ? (
          <div className="hov-empty">
            {rows.length === 0 ? 'Nothing has been spent from the donation address yet' : 'No cost matches that search'}
          </div>
        ) : (
          sorted.map((r) => (
            <div key={r.key} className="hov-donations-row">
              {/* Same #322 reasoning as the donation list: shortened, no full
                  value in an attribute. */}
              <span className="hov-donations-donor">
                {shortId(r.to, 3, 3)}
                <span className={`hov-donations-tag hov-cost-tag--${r.category}`}>
                  {COST_CATEGORY_LABELS[r.category]}
                </span>
              </span>
              <span className="hov-donations-tx">{shortId(r.txid, 4, 4)}</span>
              {r.note ? (
                <Tooltip2 content={r.note} placement="top" hoverOpenDelay={200}>
                  <span className="hov-donations-note">{r.note}</span>
                </Tooltip2>
              ) : (
                <span className="hov-donations-note hov-donations-note--empty">&mdash;</span>
              )}
              <span className="hov-num hov-donations-amount">{fmtNum(r.amount, 2)}</span>
              <span className="hov-num hov-donations-block">{fmtNum(r.blockHeight)}</span>
              <span className="hov-num hov-donations-age">{relativeAge(r.timeSec)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the tabs and header stats**

Change the `CommunitySupportPanel` signature and add tab state:

```jsx
function CommunitySupportPanel({ donations, donationRows, costRows, costs, donationsSettled, donationsFailed, donationsStatus }) {
  /*
   * Donations is the default tab (#366): it is what the panel has always been
   * about and what a first-time reader came for. Costs is the answer to
   * "where does it go", which is a second question, not a competing one.
   */
  const [tab, setTab] = useState('donations');
```

> `useState` is already imported at the top of the file. Note the hook must sit **above** the two early returns for the spinner and error states — move those below it, or React will warn about a conditional hook. Keep the early returns; just put the `useState` line first.

Replace the `hov-kv-list` block with two columns:

```jsx
            {/*
              Two stat columns rather than five stacked rows (#366). Money in
              on the left, money out on the right, so the pair reads as a
              balance and the band keeps the height it had.
            */}
            <div className="hov-kv-columns">
              <div className="hov-kv-list">
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Supporters</span>
                  <span className="hov-kv-value">{fmtNum(uniqueDonors)}</span>
                </div>
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Donations</span>
                  <span className="hov-kv-value">{fmtNum(donationCount)}</span>
                </div>
                {lastDonation && (
                  <div className="hov-kv-row">
                    <span className="hov-kv-label">Most recent</span>
                    <span className="hov-kv-value">
                      {fmtNum(lastDonation.amount, 2)} FLUX &middot; {lastAge}
                    </span>
                  </div>
                )}
              </div>

              <div className="hov-kv-list hov-kv-list--out">
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Costs</span>
                  <span className="hov-kv-value">{fmtNum(costs?.costFlux || 0, 2)} FLUX</span>
                </div>
                <div className="hov-kv-row">
                  <span className="hov-kv-label">Refunds</span>
                  <span className="hov-kv-value">{fmtNum(costs?.refundFlux || 0, 2)} FLUX</span>
                </div>
              </div>
            </div>
```

Replace the `{donationCount > 0 && <DonationList rows={donationRows} />}` line with the tab strip and the active list:

```jsx
      {donationCount > 0 && (
        <>
          <div className="hov-tabs" role="tablist" aria-label="Community support detail">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'donations'}
              className={`hov-tab${tab === 'donations' ? ' hov-tab--active' : ''}`}
              onClick={() => setTab('donations')}
            >
              Donations <span className="hov-tab-count">{donationRows.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'costs'}
              className={`hov-tab${tab === 'costs' ? ' hov-tab--active' : ''}`}
              onClick={() => setTab('costs')}
            >
              Costs <span className="hov-tab-count">{costRows.length}</span>
            </button>
          </div>

          {tab === 'donations' ? (
            <DonationList rows={donationRows} />
          ) : (
            <CostList rows={costRows} costs={costs} />
          )}
        </>
      )}
```

Remove the now-redundant `Donations` title and count from `DonationList`'s `hov-donations-head` (the tab carries the count), leaving the search input in place:

```jsx
      <div className="hov-donations-head">
        <span className="hov-donations-title">
          Donated to the project over the last year
        </span>
        <input
```

Finally, thread the props where `CommunitySupportPanel` is rendered (around line 431) — add `costRows={costRows}` and `costs={costs}` — and add `costRows` and `costs` to the outer component's destructured props beside `donationRows`. Default `costRows` to `[]` so a render before the scan lands cannot throw:

```js
  donationRows,
  costRows = [],
  costs,
```

- [ ] **Step 3: Style the tabs and stat columns**

Append to the Community Support section of `client/src/home/HomeOverview/index.scss`:

```scss
/* ── Donations / Costs tabs (issue #366) ─────────────────────────────────── */

.hov-tabs {
  display: flex;
  gap: 4px;
  margin-top: 14px;
  border-bottom: 1px solid var(--border-secondary);
}

.hov-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  background: none;
  border: none;
  /* Sits ON the container's border so the active tab joins the panel below
     rather than floating above it. */
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;

  &:hover { color: var(--text-secondary); }
}

.hov-tab--active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-green);
}

.hov-tab-count {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.65rem;
  letter-spacing: 0;
  color: var(--text-secondary);
  background: var(--surface-inset);
}

.hov-kv-columns {
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
}

/* Money out, set apart from money in without being alarming about it -- these
   are ordinary running costs, not a warning. */
.hov-kv-list--out {
  padding-left: 28px;
  border-left: 1px solid var(--border-secondary);
}

.hov-costs-breakdown {
  display: flex;
  gap: 16px;
  font-size: 0.72rem;
  color: var(--text-tertiary);

  b { color: var(--text-secondary); font-weight: 600; }
}

.hov-cost-tag--cloud { color: var(--accent-green); }
.hov-cost-tag--refund { color: var(--text-secondary); }
.hov-cost-tag--other { color: var(--text-tertiary); }

@media (max-width: 900px) {
  .hov-kv-list--out {
    padding-left: 0;
    border-left: none;
  }
}
```

- [ ] **Step 4: Verify in the running app**

```bash
docker build -t fluxnode:qa .
docker run -d --rm --name fluxnode-qa2 -p 9001:80 -v fluxnode-qa-data:/app/data -e TESTING=true fluxnode:qa
```

Open `localhost:9001/#/home` with localStorage cleared.

Expected, against the measured chain state:
- The header band shows **Costs 23.00 FLUX** and **Refunds 189.00 FLUX** in a second column, and the band is no taller than before.
- Two tabs: **Donations** (count matches the previous list) and **Costs 2**.
- The Costs tab lists exactly two rows: `t1X..74g [Other]` 23.00 with the note *"thanks for the help"*, and `t1J..8dF [Refund]` 189.00 with no note. Neither row shows a change leg.
- The breakdown line reads `0.00 Flux Cloud · 23.00 other · 189.00 refunded`.
- Switching tabs preserves the panel height enough not to jump the page.

- [ ] **Step 5: Run the full suite and build**

```bash
cd client && CI=true npx react-scripts test --watchAll=false && yarn build
```

Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add client/src/home/HomeOverview/index.jsx client/src/home/HomeOverview/index.scss
git commit -m "feat(#366): add a Costs tab and spending totals to Community Support

Closes #366"
```

---

## Self-Review

**Spec coverage**

| Requirement (issue) | Task |
|---|---|
| #367 Note column beside Transaction and Amount | 6 |
| #367 truncate with tooltip for the full note | 6 (CSS ellipsis + `Tooltip2`) |
| #366 Donations tab, default | 7 |
| #366 Costs tab beside it | 7 |
| #366 label payments to `t3Nryf…` as Flux Cloud | 4 |
| #366 label payments to prior donors as Donation Refund | 4 |
| #366 label everything else Other | 4 |
| #366 header Cost total (cloud + other) | 4 (`costFlux`), 7 (render) |
| #366 header Refund total | 4 (`refundFlux`), 7 (render) |
| #366 header keeps Total / Supporters / Donations / Most recent | 7 (unchanged) |
| #366 tabs show total counts | 7 |
| Shared prerequisite: notes and outgoing recipients survive the cache | 1, 2 |

**Type consistency checked:** `decodeTxNote` (Tasks 1, 2, 3, 4) · `senderOf` exported in Task 3, consumed in Task 4 · `buildCostRows`/`aggregateCosts` produced in Task 4, consumed in Task 5 · `costRows`/`costs` named identically in `globalStats.js`, `Home.jsx` state, and both `HomeOverview` components · `CostRow.key` produced in Task 4, used as the React key in Task 7 · `COST_CATEGORY_LABELS` keys match the three `category` values.

**Known gaps, accepted:**
- Flux Cloud renders 0.00 FLUX until the first hosting payment. Expected — decision 2.
- A refund to someone who donated only to `OLD_ADDRESS_FLUX` is labelled "Other". Expected — decision 1, commented in `costRows.js`.
- Miner fees are not counted as a cost. They are ~0.00005 FLUX per transaction and are paid to miners, not spent by the project. If that is ever wanted, `tx.fees` is in the explorer payload but is **dropped by the cache trim** and would need re-adding in Task 2.
