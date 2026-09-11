import { APP_CATEGORY_META } from 'content/appCategoryMeta';

/*
 * The three region-scoped cards beside the Network map (issue #254).
 *
 * Every figure here is whatever `stats` holds, and `stats` is produced by
 * regionStats.js for the current selection -- so selecting Europe re-computes
 * these rather than filtering a rendered list. Keeping them dumb means the
 * aggregation can be tested without React, which is where the real risk is:
 * a region total that is wrong looks exactly like a region total that is right.
 */

const TIER_COLORS = { CUMULUS: '#2686d0', NIMBUS: '#e8a33d', STRATUS: '#e05263' };

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
              <span className="nt-tier-dot" style={{ background: TIER_COLORS[tier] }} />
              {tier.charAt(0) + tier.slice(1).toLowerCase()}
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

export function NetworkResourcesCard({ stats, label }) {
  const rows = [
    { key: 'cores', label: 'CPU cores', value: fmtNum(stats?.cores) },
    { key: 'ram', label: 'RAM', value: fmtStorage(stats?.ram) },
    { key: 'ssd', label: 'SSD', value: fmtStorage(stats?.ssd) }
  ];

  // Capacity comes from the benchmark feed, which not every node reports.
  // Saying so is the difference between "this region is small" and "we measured
  // less of it".
  const measured = stats?.capNodes || 0;
  const total = stats?.nodes || 0;
  const shortfall = total - measured;

  return (
    <div className="hov-panel nt-card">
      <div className="hov-header">
        <span className="hov-header-title">NETWORK RESOURCES</span>
        <span className="hov-header-badge">{fmtNum(measured)}</span>
      </div>
      <div className="nt-card-scope">{label}</div>
      <div className="hov-kv-list">
        {rows.map((r) => (
          <div key={r.key} className="hov-kv-row">
            <span className="hov-kv-label">{r.label}</span>
            <span className="hov-kv-value">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="nt-card-foot">
        {total === 0
          ? 'No nodes in this region'
          : `measured across ${fmtNum(measured)} of ${fmtNum(total)} nodes${shortfall > 0 ? ` · ${fmtNum(shortfall)} not benchmarked` : ''}`}
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
