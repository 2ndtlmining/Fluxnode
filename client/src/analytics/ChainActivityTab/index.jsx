import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_chain_activity, filterDailyRange, summarizeDaily, relativeTimeAgo } from 'analytics/chainActivity';
import './index.scss';

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
  stalled: {
    tone: 'warning',
    text: 'Sync is behind, possibly rate-limited by the block explorer.',
  },
  unreachable: {
    tone: 'warning',
    text: "Sync couldn't reach the block explorer on its last attempt.",
  },
};

function SyncStatusBanner({ syncStatus, lastSuccessAt }) {
  const copy = SYNC_STATUS_COPY[syncStatus];
  if (!copy) return null; // caught_up (healthy) or an unrecognized future value — stay silent

  const agoText = relativeTimeAgo(lastSuccessAt);
  return (
    <div className={`ca-sync-banner ca-sync-banner--${copy.tone}`}>
      <span className="ca-sync-banner-dot" />
      <span>
        {copy.text}
        {agoText ? ` Last successful update: ${agoText}.` : ''}
      </span>
    </div>
  );
}

const RANGE_OPTIONS = [
  { label: '24H', days: 1 },
  { label: '7D', days: 7 },
];

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
}

function UtilitySummary({ daily, rangeDays, rangeLabel, syncStatus }) {
  const ranged = filterDailyRange(daily, rangeDays);
  const { utilityBlocks, emptyBlocks } = summarizeDaily(ranged);
  const total = utilityBlocks + emptyBlocks;
  const isPartial = daily.length > 0 && ranged.length < rangeDays;
  const badgeText = isPartial ? `${rangeLabel} (${ranged.length}d available)` : rangeLabel;
  // "Still building history" is only accurate for a genuinely healthy,
  // still-backfilling scanner — once the banner above is already showing a
  // real problem, repeating an falsely-reassuring message here would
  // contradict it.
  const stillBuilding = syncStatus === 'never_run' || syncStatus === 'caught_up';

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
            : 'No blocks in this range yet'}
        </div>
      ) : (
        <>
          <div className="ca-utility-bar">
            <div className="ca-utility-bar-fill" style={{ width: `${pct(utilityBlocks, total)}%` }} />
          </div>
          <div className="ca-utility-stats">
            <span className="ca-utility-stat ca-utility-stat--utility">
              {fmtNum(utilityBlocks)} utility ({pct(utilityBlocks, total)}%)
            </span>
            <span className="ca-utility-stat ca-utility-stat--empty">
              {fmtNum(emptyBlocks)} empty ({pct(emptyBlocks, total)}%)
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TeamTxList({ teamTxs, rangeDays, lastScannedHeight }) {
  const cutoffHeight = lastScannedHeight - rangeDays * 2880; // BLOCKS_PER_DAY, kept in sync with the backend constant
  const ranged = (teamTxs || []).filter((t) => t.blockHeight >= cutoffHeight);

  return (
    <div className="hov-panel ca-team-tx-panel">
      <div className="hov-header">
        <span className="hov-header-title">FLUX TEAM TRANSACTIONS</span>
        <span className="hov-header-badge">{ranged.length}</span>
      </div>
      <div className="hov-ranked-list">
        {ranged.length === 0 ? (
          <div className="hov-empty">No team transactions in this range</div>
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

export function ChainActivityTab() {
  const [data, setData] = useState({
    daily: [],
    teamTxs: [],
    lastScannedHeight: 0,
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    syncStatus: 'never_run',
  });
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(1);

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

  const activeRange = RANGE_OPTIONS.find((r) => r.days === rangeDays) || RANGE_OPTIONS[0];

  return (
    <div className="chain-activity-tab">
      <SyncStatusBanner syncStatus={data.syncStatus} lastSuccessAt={data.lastSuccessAt} />
      <div className="ca-range-toggle">
        {RANGE_OPTIONS.map((r) => (
          <button
            key={r.label}
            type="button"
            className={`ca-range-btn${r.days === rangeDays ? ' ca-range-btn--active' : ''}`}
            onClick={() => setRangeDays(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <UtilitySummary daily={data.daily} rangeDays={rangeDays} rangeLabel={activeRange.label} syncStatus={data.syncStatus} />
      <TeamTxList teamTxs={data.teamTxs} rangeDays={rangeDays} lastScannedHeight={data.lastScannedHeight} />
    </div>
  );
}
