import { useMemo, useState } from 'react';
import { Tooltip2 } from '@blueprintjs/popover2';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { filterByCategory } from 'analytics/networkAppRows';

/*
 * The applications behind the category counts (issue #351).
 *
 * The Network tab could say a country runs four Gaming apps and stop. This is
 * the list behind that number, narrowed by whatever continent or country the
 * scope selector has, and further by a category clicked in the card above.
 *
 * Sits between the map and Top Dogs, as the issue asks -- the map and cards
 * are the controls, this is what they control, so it belongs directly under
 * them rather than at the end of the page.
 */

function fmtNum(n, decimals = 0) {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/**
 * An app's remaining paid term.
 *
 * Days rather than a date: `expire` is a duration in blocks, so a date implies
 * a precision the chain does not offer -- block times drift, and "in 3 days"
 * survives that where "14 Sep 09:12" does not. The exact expiry height is in
 * the tooltip for anyone who wants to check it.
 */
function ExpiryCell({ expiry }) {
  if (!expiry) return <span className="nt-apps-muted">—</span>;

  const days = expiry.daysLeft;
  const label = expiry.expired
    ? 'Expired'
    : days < 1
      ? `${Math.max(0, Math.round(days * 24))}h`
      : `${Math.round(days)}d`;

  return (
    <Tooltip2
      content={`${expiry.expired ? 'Lapsed at' : 'Runs until'} block ${expiry.expiryHeight.toLocaleString()}`}
      placement="left"
    >
      <span className={expiry.expired ? 'nt-apps-expired' : days < 2 ? 'nt-apps-soon' : ''}>{label}</span>
    </Tooltip2>
  );
}

/** Unknown resources render as an em dash, never 0 — see networkAppRows. */
function ResCell({ value, unit, digits = 2 }) {
  if (value == null) return <span className="nt-apps-muted">—</span>;
  return (
    <>
      {fmtNum(value, digits)}
      {unit && <small> {unit}</small>}
    </>
  );
}

/*
 * How many rows reach the DOM.
 *
 * Measured without a cap: a whole-network selection rendered all 7,101 rows as
 * 93,900 DOM nodes, and every sort click or category filter cost 1,027ms of
 * frozen UI. This is a DETAIL view reached by narrowing -- pick a country, a
 * category, or type a search -- so the honest fix is to render the top slice
 * of the current sort and say plainly how many are behind it.
 *
 * 200 keeps the table under ~2,600 nodes and the interaction instant, while
 * still being more rows than anyone scrolls.
 */
const ROW_CAP = 200;

const SORTS = {
  node: (r) => r.nodeAddress,
  name: (r) => r.name,
  cpu: (r) => r.cpu ?? -1,
  ramGB: (r) => r.ramGB ?? -1,
  ssdGB: (r) => r.ssdGB ?? -1,
  expiry: (r) => r.expiresAt?.blocksLeft ?? Number.MAX_SAFE_INTEGER,
};

export function HostedAppsTable({ rows, scopeLabel, selectedCategory, onClearCategory }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'expiry', ascending: true });

  const visible = useMemo(() => {
    const byCategory = filterByCategory(rows, selectedCategory);
    const q = query.trim().toLowerCase();
    const searched = q
      ? byCategory.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.repotag.toLowerCase().includes(q) ||
            r.nodeAddress.toLowerCase().includes(q)
        )
      : byCategory;

    const get = SORTS[sort.key] || SORTS.expiry;
    return [...searched].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sort.ascending ? cmp : -cmp;
    });
  }, [rows, selectedCategory, query, sort]);

  const onSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, ascending: !prev.ascending }
        // Soonest-expiring and A-Z read best ascending; resources do not.
        : { key, ascending: key === 'expiry' || key === 'name' || key === 'node' }
    );

  const Head = ({ label, sortKey, numeric }) => (
    <th className={numeric ? 'nt-num' : undefined}>
      <button type="button" className="nt-apps-sort" onClick={() => onSort(sortKey)}>
        {label}
        {sort.key === sortKey ? (sort.ascending ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );

  const categoryMeta = selectedCategory ? APP_CATEGORY_META[selectedCategory] : null;

  return (
    <div className="hov-panel nt-apps-panel">
      <div className="hov-header">
        <span className="hov-header-title">HOSTED APPLICATION DETAIL</span>
        {/*
          The active filter is shown as a dismissible chip rather than only as
          a highlighted row in the card above. The card can be scrolled out of
          view, and a filtered list with no visible reason why reads as missing
          data.
        */}
        {selectedCategory && (
          <button type="button" className="nt-apps-chip" onClick={onClearCategory}>
            {categoryMeta?.label || selectedCategory}
            <span className="nt-apps-chip-x" aria-hidden="true">×</span>
          </button>
        )}
        <input
          className="nt-apps-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search app, image or node"
          aria-label="Search hosted applications"
        />
        <span className="hov-header-badge">{fmtNum(visible.length)}</span>
      </div>

      <div className="nt-card-scope">
        {scopeLabel}
        {selectedCategory ? ` · ${categoryMeta?.label || selectedCategory}` : ''}
      </div>

      {visible.length === 0 ? (
        <div className="hov-empty">
          {query || selectedCategory ? 'No applications match this selection' : 'No running applications in this region'}
        </div>
      ) : (
        <div className="nt-apps-scroll">
          <table className="nt-apps-table">
            <thead>
              <tr>
                <Head label="Node" sortKey="node" />
                <Head label="App" sortKey="name" />
                <th>Image</th>
                <Head label="CPU" sortKey="cpu" numeric />
                <Head label="RAM" sortKey="ramGB" numeric />
                <Head label="SSD" sortKey="ssdGB" numeric />
                <Head label="Expires" sortKey="expiry" numeric />
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, ROW_CAP).map((r) => {
                const meta = APP_CATEGORY_META[r.category] || APP_CATEGORY_META.other;
                return (
                  <tr key={r.key}>
                    <td className="nt-apps-node" title={r.nodeAddress}>{r.nodeAddress}</td>
                    <td className="nt-apps-name" title={r.name}>
                      <span className="nt-apps-dot" style={{ background: meta.color }} />
                      {r.name}
                    </td>
                    <td className="nt-apps-repo" title={r.repotag || 'Image not published'}>{r.repotag || '—'}</td>
                    <td className="nt-num"><ResCell value={r.cpu} /></td>
                    <td className="nt-num"><ResCell value={r.ramGB} unit="GB" /></td>
                    <td className="nt-num"><ResCell value={r.ssdGB} unit="GB" digits={0} /></td>
                    <td className="nt-num"><ExpiryCell expiry={r.expiresAt} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/*
        The true total is in the badge above; this says what is on screen. A
        silently truncated table would misreport the region.
      */}
      {visible.length > ROW_CAP && (
        <div className="nt-apps-note">
          Showing the first {ROW_CAP.toLocaleString()} of {visible.length.toLocaleString()} — narrow by country,
          category or search to see the rest
        </div>
      )}
    </div>
  );
}
