/*
 * How the Donor tab's Recent activity panel reads (issue #358).
 *
 * Measured before it was designed: across 233 real transactions from three
 * donor wallets in the live 7-day window,
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
 * permanently zero. Everything here follows from those two facts.
 *
 * Pure and separate from the component: what the panel SAYS is the part worth
 * pinning down, and none of it needs a DOM to decide.
 */

const SECONDS_PER_DAY = 86400;

/**
 * Consecutive node rewards collapse into one entry; anything else stands alone.
 *
 * @returns Array of
 *   { kind: 'rewards', key, rows, count, total, newest, oldest }
 *   { kind: 'row', key, row }
 *
 * Runs rather than one global reward bucket: a transfer between two runs
 * separates them, and merging across it would put the reward total somewhere
 * the reader cannot place in time. Rows arrive newest-first and stay that way.
 */
export function groupActivityRows(rows) {
  if (!Array.isArray(rows)) return [];

  const out = [];
  let run = null;

  const flush = () => {
    if (run) out.push(run);
    run = null;
  };

  for (const row of rows) {
    if (row?.type !== 'reward') {
      flush();
      out.push({ kind: 'row', key: `row-${row?.txid}`, row });
      continue;
    }

    if (!run) {
      run = {
        kind: 'rewards',
        // The first txid in the run: unique, and stable across re-renders in a
        // way an index is not.
        key: `rewards-${row.txid}`,
        rows: [],
        count: 0,
        total: 0,
        newest: row.time,
        oldest: row.time,
      };
    }

    run.rows.push(row);
    run.count += 1;
    run.total += row.amount || 0;
    // Newest-first input, so each successive row is the older end.
    run.oldest = row.time;
  }

  flush();
  return out;
}

/**
 * Per-day reward totals across the window, oldest first.
 *
 * Rewards are 94% of the activity and a flat list cannot answer the question an
 * operator actually has about them: am I earning steadily? A gap in the bars is
 * a node that stopped paying, which the list makes invisible.
 *
 * A day with no rewards is kept as a zero rather than omitted -- omitting it
 * would close the gap and hide exactly the outage worth seeing.
 */
export function dailyRewards(rows, nowSec, windowDays, coveredFrom) {
  const now = nowSec || Math.floor(Date.now() / 1000);
  const days = Math.max(1, windowDays || 7);
  const from = coveredFrom || 0;

  const bars = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = now - (i + 1) * SECONDS_PER_DAY;
    /*
     * A DAY THE SCAN NEVER REACHED IS NOT A DAY WITH NO REWARDS.
     *
     * On a busy wallet the page budget stops short of the full window (see
     * walletTxFetch), and the days before that point have no data rather than
     * no rewards. Rendering them as empty bars says the nodes stopped earning,
     * which is a confident wrong statement -- exactly what this issue exists to
     * remove. The caller draws these differently.
     */
    bars.push({ dayStart, total: 0, count: 0, covered: dayStart >= from });
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.type !== 'reward' || !row.time) continue;
    const age = now - row.time;
    const index = days - 1 - Math.floor(age / SECONDS_PER_DAY);
    if (index < 0 || index >= days) continue;
    bars[index].total += row.amount || 0;
    bars[index].count += 1;
  }

  return bars;
}

/**
 * Whether the reward strip says anything worth drawing.
 *
 * Two ways it does not. A window where no day was fully scanned renders as
 * seven hatched columns carrying no information -- seen live on an 8-node
 * wallet whose second page came back "all hosts unavailable", which truncates
 * the scan to well under a day. And a window where every scanned day earned
 * nothing is already stated by the totals.
 */
export function stripWorthShowing(bars) {
  if (!Array.isArray(bars)) return false;
  return bars.some((b) => b.covered && b.total > 0);
}

/*
 * NO FOUNDATION ROW. Measured at one receipt and zero sends across 233
 * transactions, and per #270 a payment to a Foundation address cannot be told
 * apart from an app deployment anyway. Foundation amounts fold into transfers,
 * and the individual row still carries its "Flux Foundation" label -- the
 * counterparty is worth naming, a permanently-zero total line is not.
 *
 * An App deployments row arrives here when #270's payment memo does.
 */
const RECEIVED_CATEGORIES = [
  { key: 'rewards', label: 'Node rewards', always: true },
  { key: 'exchange', label: 'From exchanges' },
  { key: 'transfers', label: 'Transfers in' },
];

const SENT_CATEGORIES = [
  { key: 'exchange', label: 'To exchanges' },
  { key: 'transfers', label: 'Transfers out' },
];

/**
 * The category lines worth rendering for one side.
 *
 * A category earns its line by having something in it. Seven fixed lines, five
 * of them permanently 0.00, is what made the panel read as empty.
 *
 * Node rewards is the exception and stays on the received side at zero: it is
 * the point of the panel, and a donor earning nothing this week needs that
 * stated rather than inferred from an absent row.
 */
export function activeCategories(side, direction) {
  const defs = direction === 'out' ? SENT_CATEGORIES : RECEIVED_CATEGORIES;
  const s = side || {};

  return defs
    .filter((d) => d.always || (Number(s[d.key]) || 0) > 0)
    .map((d) => ({ key: d.key, label: d.label, amount: Number(s[d.key]) || 0 }));
}
