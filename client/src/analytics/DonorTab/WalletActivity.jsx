import { useEffect, useMemo, useState } from 'react';
import { Tooltip2 } from '@blueprintjs/popover2';
import { explorerTxUrl, explorerAddressUrl } from 'explorerLinks';
import { fetch_wallet_tx_history } from 'analytics/walletTxFetch';
import { counterpartyDisplay, WINDOW_DAYS } from 'analytics/walletTxHistory';
import { groupActivityRows, dailyRewards, activeCategories, stripWorthShowing } from 'analytics/walletActivityView';
import { maskNodeAddress, usePrivacy } from 'analytics/privacy';

/*
 * The wallet's recent on-chain activity (issues #299, #358).
 *
 * REBUILT IN #358 against measured data. Across 233 real transactions from
 * three donor wallets in the live 7-day window:
 *
 *     node rewards      219   94.0%
 *     transfers out       9    3.9%
 *     transfers in        4    1.7%
 *     from Foundation     1    0.4%
 *     to Foundation       0      0%
 *     exchange, either    0      0%
 *
 * So the old panel reserved five of its seven category lines for 2.1% of the
 * data, three of which never fired at all, and rendered the 94% as 219
 * identical unclickable rows. Four things follow:
 *
 *   - consecutive rewards collapse into one expandable entry, so the 6% worth
 *     reading is visible rather than buried
 *   - a per-day reward strip, because a flat list cannot show a node that
 *     stopped earning
 *   - a category earns its line by having something in it
 *   - every row reaches the explorer
 */

function fmtFlux(n) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txTime(unixSeconds) {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayLabel(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { weekday: 'short' });
}

/** A transaction id that opens the explorer, or plain text when it cannot. */
function TxLink({ txid, children }) {
  const href = explorerTxUrl(txid);
  if (!href) return <span className="dt-act-plain">{children}</span>;
  return (
    <a className="dt-act-link" href={href} target="_blank" rel="noopener noreferrer" title={txid}>
      {children}
    </a>
  );
}

/*
 * Per-day reward totals. Rewards are 94% of the activity and the list cannot
 * answer the question an operator has about them -- am I earning steadily? --
 * because 219 identical rows all look the same. A missing bar is a day that
 * paid nothing, which is the thing worth seeing.
 */
function RewardStrip({ bars }) {
  if (!stripWorthShowing(bars)) return null;
  const peak = Math.max(...bars.map((b) => b.total), 0);

  return (
    <div className="dt-act-strip" role="img" aria-label="Node rewards per day across the window">
      {bars.map((b) => (
        <Tooltip2
          key={b.dayStart}
          content={
            b.covered
              ? `${dayLabel(b.dayStart)} — ${fmtFlux(b.total)} FLUX from ${b.count} ${b.count === 1 ? 'reward' : 'rewards'}`
              : `${dayLabel(b.dayStart)} — outside the scanned period, so this day is unknown`
          }
          placement="top"
          hoverOpenDelay={120}
        >
          <div className="dt-act-strip-col">
            {/*
              A day the scan never reached is NOT a day with no rewards. On a
              busy wallet the page budget stops short of the full window, and
              drawing those days as empty bars would say the nodes stopped
              earning -- the confident wrong statement this panel exists to get
              rid of. Hatched and hollow, so it reads as "no data" rather than
              "no rewards".
            */}
            <div
              className={
                !b.covered
                  ? 'dt-act-strip-bar dt-act-strip-bar--unscanned'
                  : `dt-act-strip-bar${b.total === 0 ? ' dt-act-strip-bar--empty' : ''}`
              }
              style={{ height: b.covered ? `${Math.max(2, (b.total / peak) * 100)}%` : '100%' }}
            />
            <span className={`dt-act-strip-label${b.covered ? '' : ' dt-act-strip-label--unscanned'}`}>
              {dayLabel(b.dayStart)}
            </span>
          </div>
        </Tooltip2>
      ))}
    </div>
  );
}

/** A collapsed run of consecutive node rewards, expandable to the rows behind it. */
// No privacy prop: a reward comes from the coinbase and has no counterparty
// address to mask.
function RewardRun({ entry }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="dt-act-row dt-act-row--run" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="dt-act-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="dt-act-date">{txTime(entry.oldest)}</span>
        <span className="dt-act-party">
          {entry.count} node {entry.count === 1 ? 'reward' : 'rewards'}
        </span>
        <span className="dt-act-amount dt-act-amount--in">+{fmtFlux(entry.total)}</span>
      </button>

      {open &&
        entry.rows.map((row) => (
          <div key={row.txid} className="dt-act-row dt-act-row--nested">
            <span className="dt-act-caret" />
            <span className="dt-act-date">{txTime(row.time)}</span>
            <span className="dt-act-party dt-act-party--reward">
              <TxLink txid={row.txid}>{row.txid.slice(0, 8)}…</TxLink>
            </span>
            <span className="dt-act-amount dt-act-amount--in">+{fmtFlux(row.amount)}</span>
          </div>
        ))}
    </>
  );
}

/** One non-reward transaction: the 6% the panel exists to surface. */
function ActivityRow({ row, privacy }) {
  const addressHref = explorerAddressUrl(row.counterparty);
  const shown = row.counterpartyLabel || maskNodeAddress(counterpartyDisplay(row), privacy) || counterpartyDisplay(row);

  return (
    <div className="dt-act-row">
      <span className="dt-act-caret" />
      <span className="dt-act-date">
        <TxLink txid={row.txid}>{txTime(row.time)}</TxLink>
      </span>
      <span className={`dt-act-party dt-act-party--${row.counterpartyKind || 'unknown'}`}>
        {/*
          The counterparty links to its explorer address page, except when it
          is unknown -- there is no address to open, and "Unknown" is a real
          answer rather than a missing one.
        */}
        {addressHref && !privacy ? (
          <a className="dt-act-link" href={addressHref} target="_blank" rel="noopener noreferrer" title={row.counterparty}>
            {shown}
          </a>
        ) : (
          <span title={privacy ? undefined : row.counterparty || 'Unknown counterparty'}>{shown}</span>
        )}
      </span>
      <span className={`dt-act-amount dt-act-amount--${row.direction}`}>
        {row.direction === 'in' ? '+' : '−'}{fmtFlux(row.amount)}
      </span>
    </div>
  );
}

function Side({ side, direction, title }) {
  const cats = activeCategories(side, direction);
  return (
    <div className="dt-act-col">
      <span className="dt-act-col-title">{title}</span>
      {cats.map((c) => (
        <div key={c.key} className="dt-act-line">
          <span>{c.label}</span>
          <strong>{fmtFlux(c.amount)}</strong>
        </div>
      ))}
      <div className="dt-act-line dt-act-line--total">
        <span>Total {direction === 'out' ? 'out' : 'in'}</span>
        <strong>{fmtFlux(side.total)}</strong>
      </div>
    </div>
  );
}

export function WalletActivityPanel({ walletAddress }) {
  // Read here rather than taken as a prop: the panel is the only thing that
  // needs it, and threading it from DonorTab would be a prop passed through a
  // component that does not use it.
  const privacy = usePrivacy();
  const [state, setState] = useState({ status: 'loading', summary: null });

  useEffect(() => {
    if (!walletAddress) return undefined;
    let cancelled = false;
    setState({ status: 'loading', summary: null });
    (async () => {
      const result = await fetch_wallet_tx_history(walletAddress);
      if (cancelled) return;
      setState({ status: result.ok ? 'ready' : 'error', summary: result.summary });
    })().catch(() => {
      if (!cancelled) setState({ status: 'error', summary: null });
    });
    return () => { cancelled = true; };
  }, [walletAddress]);

  const summary = state.summary;
  const entries = useMemo(() => groupActivityRows(summary?.rows), [summary]);
  const bars = useMemo(
    () => dailyRewards(summary?.rows, Math.floor(Date.now() / 1000), WINDOW_DAYS, summary?.coveredFrom),
    [summary]
  );

  if (state.status === 'loading') {
    return (
      <div className="hov-panel dt-activity-panel">
        <div className="hov-header"><span className="hov-header-title">RECENT ACTIVITY</span></div>
        <div className="hov-empty">Loading recent transactions...</div>
      </div>
    );
  }

  if (state.status === 'error' || !summary) {
    return (
      <div className="hov-panel dt-activity-panel">
        <div className="hov-header"><span className="hov-header-title">RECENT ACTIVITY</span></div>
        <div className="hov-empty">Could not load transaction history right now.</div>
      </div>
    );
  }

  const { received, sent, net, truncated, coveredFrom } = summary;

  return (
    <div className="hov-panel dt-activity-panel">
      <div className="hov-header">
        <span className="hov-header-title">RECENT ACTIVITY</span>
        <span className="hov-header-badge">last {WINDOW_DAYS} days</span>
      </div>

      {/*
        #358: the scan is capped, and a capped window used to be reported as a
        full one. Measured on a real 120-node wallet, its 7-day window holds 803
        transactions across 82 pages -- far more than one panel can afford to
        fetch -- so when the budget runs out the panel states the span it
        actually covered instead of claiming seven days.
      */}
      {truncated && (
        <div className="dt-act-truncated">
          Busy wallet — showing everything since {txTime(coveredFrom)}, not the full {WINDOW_DAYS} days.
          The totals below cover that period.
        </div>
      )}

      <RewardStrip bars={bars} />

      <div className="dt-act-summary">
        <Side side={received} direction="in" title="Received" />
        <Side side={sent} direction="out" title="Sent" />
      </div>

      <div className={`dt-act-net${net >= 0 ? ' dt-act-net--up' : ' dt-act-net--down'}`}>
        net {net >= 0 ? '+' : '−'}{fmtFlux(Math.abs(net))} FLUX
        {truncated ? ' over the period shown' : ` over ${WINDOW_DAYS} days`}
      </div>

      <div className="dt-act-list">
        {entries.length === 0 ? (
          <div className="hov-empty">No transactions in the last {WINDOW_DAYS} days</div>
        ) : (
          entries.map((entry) =>
            entry.kind === 'rewards' ? (
              <RewardRun key={entry.key} entry={entry} />
            ) : (
              <ActivityRow key={entry.key} row={entry.row} privacy={privacy} />
            )
          )
        )}
      </div>
    </div>
  );
}
