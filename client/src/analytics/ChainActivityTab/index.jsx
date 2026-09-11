import { lazy, Suspense, useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_chain_activity, summarizeDaily, relativeTimeAgo, scanProgressPct, BLOCKS_PER_DAY, RETENTION_DAYS, todaysUtilityBlocks, fetch_chain_activity_blocks, blockCategoryLabel } from 'analytics/chainActivity';
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
  const blocksRemaining = hasRange ? Math.max(0, scanTargetHeight - lastScannedHeight) : 0;
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
function UtilityDrilldown({ open }) {
  const [state, setState] = useState({ status: 'idle', data: null });

  useEffect(() => {
    if (!open || state.status !== 'idle') return;
    let cancelled = false;
    setState({ status: 'loading', data: null });
    (async () => {
      const result = await fetch_chain_activity_blocks(DRILLDOWN_LIMIT);
      if (cancelled) return;
      setState({ status: result.ok ? 'ready' : 'error', data: result });
    })().catch(() => {
      if (!cancelled) setState({ status: 'error', data: null });
    });
    return () => { cancelled = true; };
  }, [open, state.status]);

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
    return <div className="ca-drilldown ca-drilldown--message">No utility blocks recorded yet.</div>;
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
          <div key={b.height} className="ca-drilldown-row">
            <span className="ca-drilldown-height">#{fmtNum(b.height)}</span>
            <span className={`ca-drilldown-cat${b.isP2p && b.isDapp ? ' ca-drilldown-cat--both' : ''}`}>
              {blockCategoryLabel(b)}
            </span>
            <span className="ca-drilldown-txs">
              {b.transferCount > 0 ? `${fmtNum(b.transferCount)} tx` : '\u2014'}
            </span>
            <span className="ca-drilldown-date">{b.date}</span>
          </div>
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

function UtilitySummary({ daily, syncStatus, theme }) {
  const [drilldownOpen, setDrilldownOpen] = useState(false);
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
              onClick={() => setDrilldownOpen((v) => !v)}
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
          <UtilityDrilldown open={drilldownOpen} />
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await fetch_chain_activity();
      if (cancelled) return;
      setData(result);
      setLoading(false);
    })().catch(() => {
      // fetch_chain_activity() already fails soft to empty defaults — this is
      // defensive only, matching NetworkTab's own equivalent comment.
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="chain-activity-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="chain-activity-tab">
      <div className="ca-tab-hero">
        <span className="ca-tab-hero-value">{fmtNum(todaysUtilityBlocks(data.daily))}</span>
        <span className="ca-tab-hero-label">Utility blocks today</span>
      </div>
      <SyncStatusBanner
        syncStatus={data.syncStatus}
        lastSuccessAt={data.lastSuccessAt}
        lastScannedHeight={data.lastScannedHeight}
        scanStartHeight={data.scanStartHeight}
        scanTargetHeight={data.scanTargetHeight}
      />
      <UtilitySummary daily={data.daily} syncStatus={data.syncStatus} theme={theme} />
      <TeamTxList teamTxs={data.teamTxs} lastScannedHeight={data.lastScannedHeight} />
    </div>
  );
}
