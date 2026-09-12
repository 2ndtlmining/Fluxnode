import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, blocksRemainingInScan, BLOCKS_PER_DAY, RETENTION_DAYS, todaysUtilityBlocks, fetch_chain_activity_blocks, blockCategoryLabel, blockTransfersState, shouldPollSync, SYNC_POLL_INTERVAL_MS } from 'analytics/chainActivity';
import { shouldFetchDrilldown, stateAfterCancel } from './drilldownState';
import './index.scss';

/*
 * Recharts is ~82 kB gzipped -- by far the largest thing this tab pulls in --
 * and it was a static import, so it landed in the shared /analytics chunk and
 * downloaded for EVERY analytics visitor. Locked visitors can never see the
 * chart at all: Analytics.jsx wraps this tab in <PanelGate panelKey=
 * "chainActivity">, which defaults to preview='plain' and does not render its
 * children when locked. They were paying 82 kB for a component that never
 * mounts.
 *
 * Splitting here rather than at the tab boundary keeps the sync banner, hero
 * stat and team-transaction list rendering immediately -- they are cheap, and
 * deferring them behind the same fetch would trade real perceived speed for a
 * tidier split.
 *
 * The .then() unwrap is because React.lazy requires a default export and this
 * file uses named exports throughout, as does the rest of the repo. Adding a
 * default export purely to satisfy lazy() would be the tail wagging the dog.
 */
const UtilityTrendChart = lazy(() =>
  import('./UtilityTrendChart').then((m) => ({ default: m.UtilityTrendChart }))
);

/*
 * The one thing this whole tab used to be silent about: whether "no data"
 * means the scanner is genuinely still building history, or something is
 * actually wrong. See chainActivity.js's fetch_chain_activity doc comment
 * for what each syncStatus value means. Hidden entirely once healthy
 * (caught_up) — this is a "something to know about" banner, not a
 * permanent status fixture.
 */
const SYNC_STATUS_COPY = {
  api_unreachable: {
    tone: 'error',
    text: "Couldn't reach the activity service — this may be temporary.",
  },
  never_run: {
    tone: 'info',
    text: "Chain activity hasn't started syncing yet — check back shortly.",
  },
  in_progress: {
    tone: 'info',
    text: 'Sync is running — a first-time backfill can take several minutes.',
  },
  stalled: {
    tone: 'warning',
    text: 'Sync is behind, possibly rate-limited by the block explorer.',
  },
  unreachable: {
    tone: 'warning',
    text: "Sync couldn't reach the block explorer on its last attempt.",
  },
};

function SyncStatusBanner({ syncStatus, lastSuccessAt, lastScannedHeight, scanStartHeight, scanTargetHeight }) {
  const copy = SYNC_STATUS_COPY[syncStatus];
  if (!copy) return null; // caught_up (healthy) or an unrecognized future value — stay silent

  const agoText = relativeTimeAgo(lastSuccessAt);
  const hasRange = syncStatus === 'in_progress' && scanTargetHeight > scanStartHeight;
  // Two absolute chain heights this close together (e.g. "2,914,359 of
  // 2,937,099") read as "syncing millions of blocks" at a glance, even
  // though the actual gap being scanned is small (bounded by
  // RETENTION_BLOCKS) — show the real remaining count instead.
  const blocksRemaining = hasRange
    ? blocksRemainingInScan({ lastScannedHeight, scanStartHeight, scanTargetHeight })
    : 0;
  const progressText = hasRange
    ? ` ${fmtNum(blocksRemaining)} blocks remaining in this scan (${scanProgressPct({ lastScannedHeight, scanStartHeight, scanTargetHeight })}%).`
    : '';

  return (
    <div className={`ca-sync-banner ca-sync-banner--${copy.tone}`}>
      <span className="ca-sync-banner-dot" />
      <span>
        {copy.text}
        {progressText}
        {agoText ? ` Last successful update: ${agoText}.` : ''}
      </span>
    </div>
  );
}

/*
 * One block in the drill-down, openable to show its transactions (issue #282).
 *
 * These rows already highlighted on hover but did nothing when clicked -- they
 * looked interactive and were not, which is how #282 started. Real buttons now:
 * keyboard reachable, with aria-expanded, rather than a div with a listener.
 */
function BlockRow({ block, open, onToggle }) {
  const state = blockTransfersState(block);
  const canOpen = state.kind !== 'empty';

  return (
    <div className={`ca-drilldown-item${open ? ' ca-drilldown-item--open' : ''}`}>
      <button
        type="button"
        className="ca-drilldown-row"
        onClick={() => onToggle(open ? null : block.height)}
        disabled={!canOpen}
        aria-expanded={canOpen ? open : undefined}
        aria-label={`Block ${block.height}, ${blockCategoryLabel(block)}`}
      >
        <span className="ca-drilldown-height">#{fmtNum(block.height)}</span>
        <span className={`ca-drilldown-cat${block.isP2p && block.isDapp ? ' ca-drilldown-cat--both' : ''}`}>
          {blockCategoryLabel(block)}
        </span>
        <span className="ca-drilldown-txs">
          {block.transferCount > 0 ? `${fmtNum(block.transferCount)} tx` : '—'}
        </span>
        <span className="ca-drilldown-date">{block.date}</span>
        {canOpen && <span className="ca-drilldown-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>}
      </button>

      {open && <BlockTransfers state={state} transfers={block.transfers} />}
    </div>
  );
}

function BlockTransfers({ state, transfers }) {
  /*
   * "unavailable" is not "none". A record written before #282 carries a
   * transfer count but no list, and saying "no transactions" about a block that
   * had four would be a lie -- so it says what is actually true instead.
   */
  if (state.kind === 'unavailable') {
    return (
      <div className="ca-tx-panel ca-tx-panel--note">
        {fmtNum(state.total)} transactions in this block, but they were not recorded &mdash; it was
        scanned before transaction detail was stored. It refills as the scanner passes it again.
      </div>
    );
  }

  return (
    <div className="ca-tx-panel">
      <div className="ca-tx-list">
        {/*
          Keyed on txid + index, NOT txid alone. One transaction can pay several
          addresses, and extract_p2p_transfers emits one entry per output -- so
          a block legitimately contains repeated txids. Seen live on block
          2,920,896: two rows sharing d1d5d4a8…, paying different wallets.
        */}
        {(transfers || []).map((t, i) => (
          <div key={`${t.txid}-${i}`} className="ca-tx-row">
            <code className="ca-tx-id" title={t.txid}>{t.txid.slice(0, 12)}…</code>
            <span className="ca-tx-addr" title={t.from || 'unknown sender'}>
              {t.from ? `${t.from.slice(0, 8)}…${t.from.slice(-4)}` : '—'}
            </span>
            <span className="ca-tx-arrow" aria-hidden="true">→</span>
            <span className="ca-tx-addr" title={t.to}>
              {`${t.to.slice(0, 8)}…${t.to.slice(-4)}`}
            </span>
            <span className="ca-tx-amount">
              {t.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} FLUX
            </span>
          </div>
        ))}
      </div>
      {state.kind === 'capped' && (
        <div className="ca-tx-foot">
          showing {fmtNum(state.shown)} of {fmtNum(state.total)} transactions in this block
        </div>
      )}
    </div>
  );
}

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
}

const DRILLDOWN_LIMIT = 50;

/*
 * The blocks behind the Utility count (issue #199).
 *
 * Fetched LAZILY, on first expand: the retained utility-block set is a few
 * hundred KB and most visitors never open this, so the tab's initial network
 * cost is unchanged. Once fetched it is kept for the tab's lifetime -- toggling
 * closed and open again does not refetch.
 *
 * The issue's own example ("P2P (2) Dapp (2)") came from live-testing a scanner
 * that had barely started. In steady state a day holds ~490 utility blocks, so
 * this shows the category subtotals in full and caps the block list, rather
 * than rendering hundreds of rows nobody asked for.
 */
function UtilityDrilldown({ open, expectedTotal }) {
  const [state, setState] = useState({ status: 'idle', data: null });
  // Which block is expanded, or null. One at a time: the list is long and
  // several open at once turns it into a wall (#282).
  const [openHeight, setOpenHeight] = useState(null);

  /*
   * Status is mirrored in a ref so it can gate the fetch WITHOUT being an
   * effect dependency.
   *
   * Keeping `state.status` in the dependency array is what made the first
   * attempt at this fix loop: the cleanup runs on every dependency change, not
   * only on close, so resetting to 'idle' there drove
   * idle -> loading -> cleanup -> idle -> ... and fired ~290,000 requests in a
   * few seconds. With `[open]` alone the cleanup runs only when the panel
   * actually closes or unmounts, which is the only moment a reset is wanted.
   */
  const statusRef = useRef('idle');

  useEffect(() => {
    if (!open) {
      /*
       * Closing mid-flight used to strand this on 'loading' forever: the late
       * resolve is discarded below because `cancelled` is set, and the guard
       * then refused every retry -- so reopening showed "Loading blocks..."
       * with no request behind it at all (issue #253).
       */
      const reset = stateAfterCancel({ status: statusRef.current, data: null });
      if (reset.status !== statusRef.current) {
        statusRef.current = reset.status;
        setState(reset);
      }
      return;
    }

    if (!shouldFetchDrilldown(open, statusRef.current)) return;

    let cancelled = false;
    statusRef.current = 'loading';
    setState({ status: 'loading', data: null });

    (async () => {
      const result = await fetch_chain_activity_blocks(DRILLDOWN_LIMIT);
      if (cancelled) return;
      statusRef.current = result.ok ? 'ready' : 'error';
      setState({ status: statusRef.current, data: result });
    })().catch(() => {
      if (cancelled) return;
      statusRef.current = 'error';
      setState({ status: 'error', data: null });
    });

    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  if (state.status === 'loading' || state.status === 'idle') {
    return <div className="ca-drilldown ca-drilldown--message">Loading blocks...</div>;
  }
  if (state.status === 'error') {
    // Fails soft: say so and stay collapsed rather than blanking the panel.
    return <div className="ca-drilldown ca-drilldown--message">Could not load block detail right now.</div>;
  }

  const { totals, blocks } = state.data;
  if (totals.utilityTotal === 0) {
    /*
     * Two very different situations reach here, and saying "none recorded" for
     * both is what made issue #231 read as a broken panel.
     *
     * The count above this drill-down comes from the daily rollup; the blocks
     * come from a separate file the scanner only writes while it is actually
     * scanning. A deployment that caught up before utility blocks existed has
     * the former and not the latter, so the panel claimed there was nothing
     * there directly underneath a non-zero figure. The API now backfills that
     * case, but the scan takes a while, so say so instead of contradicting the
     * number the user just clicked.
     */
    const message =
      expectedTotal > 0
        ? 'Block detail is still being built for this window. It appears once the scanner finishes its next pass.'
        : 'No utility blocks recorded yet.';
    return <div className="ca-drilldown ca-drilldown--message">{message}</div>;
  }

  return (
    <div className="ca-drilldown" id="ca-utility-drilldown">
      <div className="ca-drilldown-chips">
        <span className="ca-chip ca-chip--p2p">
          P2P <strong>{fmtNum(totals.p2pOnly)}</strong>
        </span>
        <span className="ca-chip ca-chip--dapp">
          Dapp <strong>{fmtNum(totals.dappOnly)}</strong>
        </span>
        <span className="ca-chip ca-chip--both" title="Blocks carrying a P2P transfer AND an app deployment">
          Both <strong>{fmtNum(totals.both)}</strong>
        </span>
      </div>

      <div className="ca-drilldown-list">
        {blocks.map((b) => (
          <BlockRow key={b.height} block={b} open={openHeight === b.height} onToggle={setOpenHeight} />
        ))}
      </div>

      {blocks.length < totals.utilityTotal && (
        <div className="ca-drilldown-footer">
          showing {fmtNum(blocks.length)} of {fmtNum(totals.utilityTotal)} utility blocks, most recent first
        </div>
      )}
    </div>
  );
}

function UtilitySummary({ daily, syncStatus, theme, drilldownOpen, onToggleDrilldown }) {
  const { utilityBlocks, emptyBlocks } = summarizeDaily(daily);
  const total = utilityBlocks + emptyBlocks;
  const badgeText = daily.length === 1 ? '1 day' : `${daily.length} days`;
  // "Still building history" is only accurate for a genuinely healthy,
  // still-backfilling scanner — once the banner above is already showing a
  // real problem, repeating a falsely-reassuring message here would
  // contradict it.
  const stillBuilding = syncStatus === 'never_run' || syncStatus === 'in_progress' || syncStatus === 'caught_up';

  return (
    <div className="hov-panel ca-utility-panel">
      <div className="hov-header">
        <span className="hov-header-title">UTILITY VS EMPTY BLOCKS</span>
        <span className="hov-header-badge">{badgeText}</span>
      </div>
      {total === 0 ? (
        <div className="hov-empty">
          {daily.length === 0
            ? (stillBuilding ? 'Still building history — check back shortly' : 'No data available')
            : 'No blocks recorded yet'}
        </div>
      ) : (
        <>
          <Suspense fallback={<div className="ca-trend-chart-loading" aria-label="Loading chart" />}>
            <UtilityTrendChart daily={daily} theme={theme} />
          </Suspense>
          <div className="ca-utility-stats">
            {/*
              * A real <button>, not a click handler on a span: this is the only
              * way into the drill-down, and it has to be reachable and
              * announceable without a mouse.
              */}
            <button
              type="button"
              className={`ca-utility-stat ca-utility-stat--utility ca-utility-stat--button${drilldownOpen ? ' ca-utility-stat--open' : ''}`}
              onClick={onToggleDrilldown}
              aria-expanded={drilldownOpen}
              aria-controls="ca-utility-drilldown"
            >
              {fmtNum(utilityBlocks)} utility ({pct(utilityBlocks, total)}%)
              <span className="ca-utility-caret" aria-hidden="true">{drilldownOpen ? '\u25b4' : '\u25be'}</span>
            </button>
            <span className="ca-utility-stat ca-utility-stat--empty">
              {fmtNum(emptyBlocks)} empty ({pct(emptyBlocks, total)}%)
            </span>
          </div>
          <UtilityDrilldown open={drilldownOpen} expectedTotal={utilityBlocks} />
        </>
      )}
    </div>
  );
}

function TeamTxList({ teamTxs, lastScannedHeight }) {
  const cutoffHeight = lastScannedHeight - RETENTION_DAYS * BLOCKS_PER_DAY;
  const ranged = (teamTxs || []).filter((t) => t.blockHeight >= cutoffHeight);

  return (
    <div className="hov-panel ca-team-tx-panel">
      <div className="hov-header">
        <span className="hov-header-title">FLUX TEAM TRANSACTIONS</span>
        <span className="hov-header-badge">{ranged.length} in {RETENTION_DAYS}d</span>
      </div>
      <div className="hov-ranked-list">
        {ranged.length === 0 ? (
          <div className="hov-empty">No team transactions in the retained window</div>
        ) : (
          ranged.map((tx) => (
            <div key={tx.txid} className="ca-team-tx-row">
              <span className="ca-team-tx-height">#{fmtNum(tx.blockHeight)}</span>
              <span className="ca-team-tx-addrs">
                {tx.from.slice(0, 8)}… → {tx.to.slice(0, 8)}…
              </span>
              <span className="hov-badge">{tx.amount.toFixed(2)} FLUX</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ChainActivityTab({ theme = 'dark' }) {
  const [data, setData] = useState({
    daily: [],
    teamTxs: [],
    lastScannedHeight: 0,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    scanStartHeight: 0,
    scanTargetHeight: 0,
    syncStatus: 'never_run',
  });
  const [loading, setLoading] = useState(true);
  // Lifted out of UtilitySummary so the hero above can open the same panel.
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const toggleDrilldown = () => setDrilldownOpen((v) => !v);

  /*
   * Mirrors the latest sync status for the interval below to read (issue #280).
   *
   * A ref rather than state, with the effect kept on [] deps. Reading reactive
   * state from a polling effect is exactly what caused the ~290,000-request
   * runaway in the drilldown effect -- status changed, the effect re-ran, its
   * cleanup reset status, and round it went. The shape that fixed that one is
   * the shape used here: nothing reactive in the dependency array.
   */
  const syncStatusRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await fetch_chain_activity();
      if (cancelled) return;
      syncStatusRef.current = result.syncStatus;
      setData(result);
      setLoading(false);
    };

    load().catch(() => {
      // fetch_chain_activity() already fails soft to empty defaults — this is
      // defensive only, matching NetworkTab's own equivalent comment.
      if (!cancelled) setLoading(false);
    });

    /*
     * Without this the banner asserts its mount-time status for as long as the
     * tab stays open -- which is worst in the case it exists for, since it asks
     * the user to wait out a backfill and then never reports the outcome.
     * Stops for good once the scanner is caught up.
     */
    const id = setInterval(() => {
      if (!shouldPollSync(syncStatusRef.current)) {
        clearInterval(id);
        return;
      }
      load().catch(() => {});
    }, SYNC_POLL_INTERVAL_MS);

    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) {
    return (
      <div className="chain-activity-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const { utilityBlocks, emptyBlocks } = summarizeDaily(data.daily);
  const hasBlocks = utilityBlocks + emptyBlocks > 0;

  return (
    <div className="chain-activity-tab">
      {/*
        * The hero is the biggest thing on the tab and the first thing anyone
        * tries to click, but it did nothing -- the only way into the block
        * drill-down was a small caret on a stat line below the chart, which
        * reads as decoration (issue #253). It opens the same panel now.
        *
        * Only interactive when there are blocks to show: a button that does
        * nothing is worse than a plain figure.
        */}
      {hasBlocks ? (
        <button
          type="button"
          className={`ca-tab-hero ca-tab-hero--button${drilldownOpen ? ' ca-tab-hero--open' : ''}`}
          onClick={toggleDrilldown}
          aria-expanded={drilldownOpen}
          aria-controls="ca-utility-drilldown"
        >
          <span className="ca-tab-hero-value">{fmtNum(todaysUtilityBlocks(data.daily))}</span>
          <span className="ca-tab-hero-label">
            Utility blocks today
            <span className="ca-tab-hero-hint">{drilldownOpen ? 'Hide blocks' : 'Show blocks'}</span>
          </span>
        </button>
      ) : (
        <div className="ca-tab-hero">
          <span className="ca-tab-hero-value">{fmtNum(todaysUtilityBlocks(data.daily))}</span>
          <span className="ca-tab-hero-label">Utility blocks today</span>
        </div>
      )}
      <SyncStatusBanner
        syncStatus={data.syncStatus}
        lastSuccessAt={data.lastSuccessAt}
        lastScannedHeight={data.lastScannedHeight}
        scanStartHeight={data.scanStartHeight}
        scanTargetHeight={data.scanTargetHeight}
      />
      <UtilitySummary
        daily={data.daily}
        syncStatus={data.syncStatus}
        theme={theme}
        drilldownOpen={drilldownOpen}
        onToggleDrilldown={toggleDrilldown}
      />
      <TeamTxList teamTxs={data.teamTxs} lastScannedHeight={data.lastScannedHeight} />
    </div>
  );
}
