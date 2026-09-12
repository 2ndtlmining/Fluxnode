import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { tierMeta } from 'content/nodeTierMeta';

/*
 * The three region-scoped cards beside the Network map (issue #254).
 *
 * Every figure here is whatever `stats` holds, and `stats` is produced by
 * regionStats.js for the current selection -- so selecting Europe re-computes
 * these rather than filtering a rendered list. Keeping them dumb means the
 * aggregation can be tested without React, which is where the real risk is:
 * a region total that is wrong looks exactly like a region total that is right.
 */

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** TB where it helps, GB where TB would read as 0.0. */
function fmtStorage(gb) {
  if (!gb) return '—';
  return gb >= 1024 ? `${(gb / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} TB` : `${fmtNum(gb)} GB`;
}

export function TotalNetworkCard({ stats, label }) {
  const t = stats?.tiers || {};
  return (
    <div className="hov-panel nt-card">
      <div className="hov-header">
        <span className="hov-header-title">TOTAL NETWORK</span>
        <span className="hov-header-badge">{fmtNum(stats?.nodes)}</span>
      </div>
      <div className="nt-card-scope">{label}</div>
      <div className="hov-kv-list">
        {['CUMULUS', 'NIMBUS', 'STRATUS'].map((tier) => (
          <div key={tier} className="hov-kv-row">
            <span className="hov-kv-label">
              <span className="nt-tier-dot" style={{ background: tierMeta(tier).color }} />
              {tierMeta(tier).label}
            </span>
            <span className="hov-kv-value">{fmtNum(t[tier] || 0)}</span>
          </div>
        ))}
        <div className="hov-kv-row nt-kv-row--total">
          <span className="hov-kv-label">Unique wallets</span>
          <span className="hov-kv-value">{fmtNum(stats?.wallets)}</span>
        </div>
      </div>
    </div>
  );
}

/*
 * One resource, as capacity AND what is actually reserved on it (issue #287).
 *
 * The bar is the point of the card: a region that is 90% committed and a region
 * that is 10% committed are the same row of numbers otherwise, and telling them
 * apart is the whole reason to drill into a country.
 */
function UtilisationRow({ label, used, total, format, color }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  // Clamped only for the BAR's width. The printed percentage stays truthful --
  // if reservations ever exceed measured capacity, hiding it would be the bug.
  const barPct = Math.max(0, Math.min(100, pct));

  return (
    <div className="nt-util-row">
      <div className="nt-util-head">
        <span className="hov-kv-label">{label}</span>
        <span className="hov-kv-value">
          {total > 0 ? `${pct.toFixed(1)}%` : '—'}
        </span>
      </div>
      <div className="nt-util-track">
        <div className="nt-util-fill" style={{ width: `${barPct}%`, background: color }} />
      </div>
      <div className="nt-util-actuals">
        {total > 0 ? `${format(used)} of ${format(total)}` : 'not measured'}
      </div>
    </div>
  );
}

export function NetworkResourcesCard({ stats, label }) {
  // Capacity comes from the benchmark feed, which not every node reports.
  // Saying so is the difference between "this region is small" and "we measured
  // less of it".
  const measured = stats?.capNodes || 0;
  const total = stats?.nodes || 0;
  const shortfall = total - measured;

  // Utilisation is only ever summed for nodes that also reported capacity (see
  // regionStats.addNode), so this can never exceed `measured` -- but it can be
  // lower, and a percentage computed over a smaller set than it appears to
  // cover is worth saying out loud.
  const utilised = stats?.utilNodes || 0;
  const utilShortfall = measured - utilised;

  const rows = [
    { key: 'cores', label: 'CPU cores', used: stats?.usedCores, total: stats?.cores, format: fmtNum, color: '#6366f1' },
    { key: 'ram', label: 'RAM', used: stats?.usedRam, total: stats?.ram, format: fmtStorage, color: '#3b82f6' },
    { key: 'ssd', label: 'SSD', used: stats?.usedSsd, total: stats?.ssd, format: fmtStorage, color: '#2686d0' }
  ];

  return (
    <div className="hov-panel nt-card">
      <div className="hov-header">
        <span className="hov-header-title">NETWORK RESOURCES</span>
        <span className="hov-header-badge">{fmtNum(measured)}</span>
      </div>
      <div className="nt-card-scope">{label}</div>
      <div className="nt-util-list">
        {rows.map((r) => (
          <UtilisationRow
            key={r.key}
            label={r.label}
            used={r.used || 0}
            total={r.total || 0}
            format={r.format}
            color={r.color}
          />
        ))}
      </div>
      <div className="nt-card-foot">
        {total === 0
          ? 'No nodes in this region'
          : `measured across ${fmtNum(measured)} of ${fmtNum(total)} nodes${shortfall > 0 ? ` · ${fmtNum(shortfall)} not benchmarked` : ''}${utilShortfall > 0 ? ` · usage from ${fmtNum(utilised)}` : ''}`}
      </div>
    </div>
  );
}

export function HostedApplicationsCard({ stats, label }) {
  const entries = Object.entries(stats?.appsByCategory || {}).sort((a, b) => b[1] - a[1]);
  const total = stats?.appInstances || 0;

  return (
    <div className="hov-panel nt-card">
      <div className="hov-header">
        <span className="hov-header-title">HOSTED APPLICATIONS</span>
        <span className="hov-header-badge">{fmtNum(total)}</span>
      </div>
      <div className="nt-card-scope">{label}</div>
      {entries.length === 0 ? (
        <div className="hov-empty">No running apps in this region</div>
      ) : (
        <div className="hov-kv-list nt-apps-list">
          {entries.map(([category, count]) => {
            const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
            const Icon = meta?.Icon;
            return (
              <div key={category} className="hov-kv-row">
                <span className="hov-kv-label">
                  {Icon && <Icon size={11} style={{ color: meta.color }} className="nt-app-icon" />}
                  {meta?.label || category}
                </span>
                <span className="hov-kv-value">{fmtNum(count)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
