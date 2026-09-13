import { groupActivityRows, dailyRewards, activeCategories, stripWorthShowing } from './walletActivityView';

/*
 * Issue #358. How the Recent activity panel should read, measured before it
 * was designed: across 233 real transactions from three donor wallets in the
 * live 7-day window,
 *
 *     node rewards      219   94.0%
 *     transfers out       9    3.9%
 *     transfers in        4    1.7%
 *     from Foundation     1    0.4%
 *     to Foundation       0      0%
 *     exchange, either    0      0%
 *
 * So the list was a wall of identical reward rows with the 6% worth looking at
 * buried inside it, and five of the seven category lines on screen were
 * permanently zero.
 */

const DAY = 86400;
const NOW = 1_789_000_000;

function reward(id, ageDays, amount = 0.75) {
  return { txid: `r${id}`, time: NOW - Math.round(ageDays * DAY), direction: 'in', type: 'reward', amount, height: 2_900_000 + id };
}
function transfer(id, ageDays, direction = 'out', amount = 100) {
  return {
    txid: `t${id}`, time: NOW - Math.round(ageDays * DAY), direction, type: 'transfer', amount,
    counterparty: 't1Somebody', counterpartyLabel: null, counterpartyKind: null, height: 2_900_100 + id,
  };
}

describe('groupActivityRows', () => {
  it('collapses a run of consecutive rewards into one entry', () => {
    const rows = [reward(1, 0.1), reward(2, 0.2), reward(3, 0.3)];

    const out = groupActivityRows(rows);

    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('rewards');
    expect(out[0].count).toBe(3);
    expect(out[0].total).toBeCloseTo(2.25, 6);
  });

  /*
   * The point of the whole change. The 6% that is not a reward must stay
   * visible as its own line rather than being buried among 219 identical ones.
   */
  it('keeps a non-reward as its own entry, between the runs it separates', () => {
    const rows = [reward(1, 0.1), transfer(9, 0.2), reward(2, 0.3), reward(3, 0.4)];

    const out = groupActivityRows(rows);

    expect(out.map((e) => e.kind)).toEqual(['rewards', 'row', 'rewards']);
    expect(out[0].count).toBe(1);
    expect(out[1].row.txid).toBe('t9');
    expect(out[2].count).toBe(2);
  });

  it('carries the span a run covers, so it can be labelled', () => {
    const rows = [reward(1, 0.5), reward(2, 2), reward(3, 3)];

    const [run] = groupActivityRows(rows);

    // Rows arrive newest-first, so the run runs from its last to its first.
    expect(run.newest).toBe(rows[0].time);
    expect(run.oldest).toBe(rows[2].time);
  });

  it('keeps the underlying rows so a run can be expanded', () => {
    const rows = [reward(1, 0.1), reward(2, 0.2)];

    expect(groupActivityRows(rows)[0].rows).toHaveLength(2);
  });

  it('gives every entry a stable unique key', () => {
    const out = groupActivityRows([reward(1, 0.1), transfer(9, 0.2), reward(2, 0.3)]);

    expect(new Set(out.map((e) => e.key)).size).toBe(out.length);
  });

  it('returns [] for junk rather than throwing', () => {
    expect(groupActivityRows(null)).toEqual([]);
    expect(groupActivityRows([])).toEqual([]);
  });
});

/*
 * Rewards are 94% of the activity, and a flat list cannot answer the one
 * question an operator actually has about them: am I earning steadily? A gap
 * in the bars is a node that stopped paying, which is currently invisible.
 */
describe('dailyRewards', () => {
  it('buckets rewards into one entry per day of the window, oldest first', () => {
    const bars = dailyRewards([reward(1, 0.5), reward(2, 2.5)], NOW, 7);

    expect(bars).toHaveLength(7);
    expect(bars[0].dayStart).toBeLessThan(bars[6].dayStart);
  });

  it('sums the rewards that fall in each day', () => {
    const bars = dailyRewards([reward(1, 0.5, 1), reward(2, 0.6, 2), reward(3, 2.5, 5)], NOW, 7);
    const byTotal = bars.filter((b) => b.total > 0).map((b) => b.total);

    expect(byTotal.reduce((a, b) => a + b, 0)).toBeCloseTo(8, 6);
  });

  it('renders a day with no rewards as zero rather than omitting it', () => {
    // An omitted day would close the gap and hide the outage it represents.
    const bars = dailyRewards([reward(1, 0.5)], NOW, 7);

    expect(bars).toHaveLength(7);
    expect(bars.filter((b) => b.total === 0).length).toBe(6);
  });

  it('ignores anything that is not a reward', () => {
    const bars = dailyRewards([transfer(1, 0.5, 'in', 500)], NOW, 7);

    expect(bars.every((b) => b.total === 0)).toBe(true);
  });

  it('handles junk without throwing', () => {
    expect(dailyRewards(null, NOW, 7)).toHaveLength(7);
  });
});

/*
 * The fix for "bland". Seven fixed lines, five of them permanently 0.00, is
 * what makes the panel read as empty -- so a category earns its line by having
 * something in it.
 */
describe('activeCategories', () => {
  const side = (over) => ({ rewards: 0, exchange: 0, transfers: 0, total: 0, count: 0, ...over });

  it('drops a category with nothing in it', () => {
    const cats = activeCategories(side({ rewards: 12, total: 12 }), 'in');

    expect(cats.map((c) => c.key)).toEqual(['rewards']);
  });

  it('keeps every category that has something', () => {
    const cats = activeCategories(side({ rewards: 12, exchange: 5, transfers: 3, total: 20 }), 'in');

    expect(cats.map((c) => c.key)).toEqual(['rewards', 'exchange', 'transfers']);
  });

  /*
   * Node rewards are the point of the panel: a donor earning nothing this week
   * needs to see that stated, not inferred from an absent row.
   */
  it('keeps node rewards on the received side even at zero', () => {
    expect(activeCategories(side(), 'in').map((c) => c.key)).toEqual(['rewards']);
  });

  it('has no rewards row on the sent side, since a wallet cannot send one', () => {
    expect(activeCategories(side({ rewards: 99 }), 'out').map((c) => c.key)).not.toContain('rewards');
  });

  it('never offers a Foundation row', () => {
    // #358: measured 1 receipt and 0 sends across 233 transactions, and per
    // #270 a payment to the Foundation cannot be told apart from an app
    // deployment anyway. Foundation amounts fold into transfers, and the
    // individual row still carries the "Flux Foundation" label.
    const cats = activeCategories(side({ transfers: 45, total: 45 }), 'out');

    expect(cats.map((c) => c.key)).not.toContain('foundation');
  });
});

/*
 * A day the scan never reached is NOT a day with no rewards.
 *
 * Caught on the live 120-node wallet: its scan covered only from 12 Sept, so
 * the four earlier bars rendered at the empty-bar minimum -- which reads as
 * "my nodes stopped earning for four days" when the truth is "we did not look".
 * That is precisely the class of confident-wrong-statement this whole issue is
 * about, reintroduced by the fix for it.
 */
describe('dailyRewards marks days the scan never reached', () => {
  it('flags a day older than the covered period as unscanned, not empty', () => {
    const coveredFrom = NOW - 3 * DAY;

    const bars = dailyRewards([reward(1, 0.5)], NOW, 7, coveredFrom);

    const unscanned = bars.filter((b) => !b.covered);
    expect(unscanned.length).toBe(4);
    // Still zero, but distinguishable from a real zero.
    expect(unscanned.every((b) => b.total === 0)).toBe(true);
  });

  it('treats every day as covered when the window was fully scanned', () => {
    const bars = dailyRewards([reward(1, 0.5)], NOW, 7);

    expect(bars.every((b) => b.covered)).toBe(true);
  });

  it('keeps a genuine zero inside the covered period distinguishable', () => {
    // A day we DID scan and found nothing is a real outage worth showing.
    const bars = dailyRewards([reward(1, 0.5)], NOW, 7, NOW - 7 * DAY);
    const quiet = bars.filter((b) => b.covered && b.total === 0);

    expect(quiet.length).toBe(6);
  });
});

/*
 * When the scan reached back less than a full day -- which happens when a page
 * fails, not only on busy wallets -- every bar is uncovered and the strip is
 * seven hatched columns saying nothing. Seen live: an 8-node wallet whose
 * page 2 returned "all hosts unavailable".
 */
describe('stripWorthShowing', () => {
  it('is false when no day was fully covered', () => {
    const bars = dailyRewards([reward(1, 0.1)], NOW, 7, NOW - 3600);

    expect(stripWorthShowing(bars)).toBe(false);
  });

  it('is true once a covered day carries rewards', () => {
    const bars = dailyRewards([reward(1, 1.5, 3)], NOW, 7, NOW - 7 * DAY);

    expect(stripWorthShowing(bars)).toBe(true);
  });

  it('is false when every covered day is genuinely empty', () => {
    // Nothing earned and nothing to plot -- the totals already say so.
    expect(stripWorthShowing(dailyRewards([], NOW, 7, NOW - 7 * DAY))).toBe(false);
  });
});
