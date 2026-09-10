# Calculation-correctness audit harness

Verifies the numbers this site displays against an **independently derived**
reference, rather than against more tests written from the same understanding
as the code.

## Why not just write more unit tests

Because that provably does not work here. When this audit began:

- `donor/donorStatus.test.js` passed.
- `apidata.test.js` passed.
- And `apidata.js`'s `fetch_total_donations` carried the exact bug PR #196 had
  already fixed in the file next door — scanning only the current donation
  address, so every pre-2026-09-03 donation was invisible. It fed the `donor`,
  `super_donor` and `sugar_daddy` achievement gates, silently denying early
  supporters achievements they had earned.

Two green test files, one live bug sitting between them. The function had zero
coverage, and tests written from the same assumptions as the code would not
have found it. Finding it took tracing a displayed value back to its source.

Tests earn their keep *after* the harness finds something — as the regression
guard on the fix.

## The method

**The app side runs the app's own code. The reference side is independently
reimplemented. Both are fed the same captured bytes.**

That last clause matters more than it looks. Comparing a figure the app computed
at T1 against upstream data fetched at T2 produces false positives all day —
node counts, prices and block heights all move between the two reads. Capturing
once removes the timing variable entirely and makes a run reproducible months
later.

The reference is deliberately *not* a port of `apidata.js`. A port would
reproduce the app's bugs and agree with them perfectly, which is the exact
failure this exists to avoid. Every formula in `reference/` is re-derived from
documented protocol facts, with the derivation written out in the file.

## Running it

```bash
# 1. Snapshot upstream (writes tools/audit/fixtures/<stamp>/ and .../latest/)
python tools/audit/capture.py

# 2. App side — runs the app's real functions against that snapshot
cd client && CI=true npx react-scripts test --watchAll=false d1AppSide && cd ..

# 3. Independent reference
python tools/audit/reference/d1_earnings.py

# 4. Verdict
python tools/audit/compare.py
```

`compare.py` exits **0** when the two agree, **1** on disagreement, **2** when
an input is missing.

Fixtures are gitignored — they are evidence for one run, not source.

## What a disagreement means

**One of the two is wrong. Not necessarily the app.** The reference is an
independent derivation, not an oracle; a mismatch means the two disagree and
both are worth reading before deciding which to change.

## What "AGREE" does *not* establish

It shows the app's arithmetic matches an independently derived formula **over
the same inputs**. It says nothing about whether the inputs are right.

A stale `CC_BLOCK_REWARD` is the live example: issue #202 records that the first
PoN subsidy reduction lands at block 3,071,200 (~2026-10-25), taking it from 14
to 12.6. After that date the app and this reference would still agree perfectly
— both reading the same stale constant — while every earnings figure on the
site read ~11% high. Input correctness is a separate problem from arithmetic
correctness, and this harness only addresses the second.

`constantsParity.test.js` covers one narrow slice of the first: it fails if
`setupTests.js` and `public/runtime/app-content.js` ever disagree. That matters
because the app side runs under Jest and therefore reads the *test* constants —
its output is only meaningful while those two agree. It is also how the #202
update gets caught if someone edits production without the test doubles.

## Verifying the harness itself

A harness that always reports "agree" is worthless. This one was mutation-tested
by recomputing the reference at a 12.6 subsidy — the exact change #202 predicts
— and confirming `compare.py` reported all nine affected figures and exited 1.
`pay_frequency` correctly did *not* flag, since it depends on node count rather
than subsidy: the harness discriminates rather than blanket-failing.

Re-run that check after any change to `compare.py`.

## Domains

The audit is carved by data-dependency rather than by page, because
`apidata.js` alone feeds Home, Nodes and Analytics — page-by-page would audit
shared code three times.

| Domain | Covers | Status |
|---|---|---|
| **D1** earnings & rewards | tier projections, per-node payment, PA amount, APY, pay frequency | **agrees** — app matches the independent reference on all 12 figures |
| **D2** node & app counts | running-app counting, the canonical-source invariant | **holds** — 0 unparseable container names; ordered exceeds running, but only by 1.02x |
| **D3** donations & donor status | `fetch_total_donations`, `donorStatus` | **bug found and fixed** — #213 |
| **D4** rankings & achievements | `rankInGroup`, `topInGroup`, tier assignment | **bug found** — #215, 788 nodes (12.6%) given the wrong tier |
| **D5** live & chain | coinbase reward extraction | **clean** — 48/48 outputs classified across 12 blocks, 0 silently dropped |

### Findings, and what each cost

- **#213 (D3, fixed)** — `fetch_total_donations` scanned only the current
  donation address, so pre-2026-09-03 donations were invisible. It feeds the
  `donor`/`super_donor`/`sugar_daddy` achievement gates, so early supporters
  were being denied achievements they had earned. The function had zero test
  coverage; `donorStatus.js` had the same bug fixed in PR #196, so donors kept
  premium ACCESS and only the achievements vanished — which is why nobody
  noticed.
- **#215 (D4, open)** — `ipTierMap` strips the port, so hosts running several
  tiers collide and the API's last entry wins for all of them. 788 of 6237
  benchmarked nodes get the wrong tier, always upward. Needs a design pass:
  `nodeData[].ip` is the join key for ranks, achievements and the node grid.

### Two observations that are not bugs but are worth knowing

- **D2's safety margin is thin.** Ordered exceeds running by only 1.02x. The
  canonical-source rule exists because those two must never be swapped — but at
  a 2% gap, a swap would produce numbers that look entirely plausible. The rule
  cannot be enforced by eyeballing the result; it has to be enforced in code.
- **D5 drops silently by design.** `extractRewardsFromCoinbase` has no `else`:
  an output matching no tier window simply never appears. Zero drops in this
  sample, but the failure mode is invisible rather than loud, so it is worth
  re-running after any change to the reward split.

## Adding a domain

1. Add its upstream to `SOURCES` in `capture.py`, with a `why` line saying what
   the data is for.
2. Write `reference/<domain>.py`. **Derive the formulas; do not port them.**
   Write the derivation into the module docstring — if you cannot state why a
   formula is right without pointing at the app, you have ported it.
3. Add `client/src/audit/<domain>AppSide.test.js`, guarded on fixture presence
   so it stays inert during a normal `npm test`.
4. Teach `compare.py` the new pair of files.
5. Mutation-test it before trusting a green result.
