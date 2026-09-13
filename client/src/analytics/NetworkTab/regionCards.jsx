import { Tooltip2 } from '@blueprintjs/popover2';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { tierMeta } from 'content/nodeTierMeta';
// Shared with the Donor tab's utilisation rows (#355). It had its own copy of
// this, identical to that one -- which is the arrangement NODE_TIER_META's
// comment describes drifting apart for tier colours.
import { formatStorage } from 'analytics/utilizationDisplay';

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
    { key: 'ram', label: 'RAM', used: stats?.usedRam, total: stats?.ram, format: formatStorage, color: '#3b82f6' },
    { key: 'ssd', label: 'SSD', used: stats?.usedSsd, total: stats?.ssd, format: formatStorage, color: '#2686d0' }
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

/*
 * `selectedCategory` / `onSelectCategory` drive the detail list below the map
 * (issue #351). Optional: the card still renders as a plain read-only tally
 * when no handler is passed, which is what the locked preview shows.
 */
export function HostedApplicationsCard({ stats, label, selectedCategory, onSelectCategory }) {
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
              /*
                #333: the row was a label and a number with no way to find out
                what is in the category. Same tooltip the Apps tab, the
                ecosystem panel and the Workhorse showcase already use, so the
                explanation is written once in CATEGORY_TOOLTIPS.
              */
              <Tooltip2
                key={category}
                content={<CategoryTooltip category={category} />}
                placement="top"
                hoverOpenDelay={200}
                popoverClassName="hov-cat-tooltip"
              >
                {/*
                  A button only when something listens (#351). A row that looks
                  clickable and does nothing is worse than a plain row, and the
                  locked preview renders this card with no handler.
                */}
                {onSelectCategory ? (
                  <button
                    type="button"
                    className={`hov-kv-row nt-app-row nt-app-row--button${
                      selectedCategory === category ? ' nt-app-row--selected' : ''
                    }`}
                    // Clicking the selected category clears it, so the row is
                    // its own "show all" without a second control.
                    onClick={() => onSelectCategory(selectedCategory === category ? null : category)}
                    aria-pressed={selectedCategory === category}
                  >
                    <span className="hov-kv-label">
                      {Icon && <Icon size={11} style={{ color: meta.color }} className="nt-app-icon" />}
                      {meta?.label || category}
                    </span>
                    <span className="hov-kv-value">{fmtNum(count)}</span>
                  </button>
                ) : (
                  <div className="hov-kv-row nt-app-row">
                    <span className="hov-kv-label">
                      {Icon && <Icon size={11} style={{ color: meta.color }} className="nt-app-icon" />}
                      {meta?.label || category}
                    </span>
                    <span className="hov-kv-value">{fmtNum(count)}</span>
                  </div>
                )}
              </Tooltip2>
            );
          })}
        </div>
      )}
    </div>
  );
}
