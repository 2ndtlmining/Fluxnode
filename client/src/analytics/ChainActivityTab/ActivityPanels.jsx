import { useMemo, useState } from 'react';
import { Tooltip2 } from '@blueprintjs/popover2';
import { BlockLink } from 'components/BlockLink';
import { explorerTxUrl } from 'explorerLinks';
import { filterRows, sortRows } from './activityRows';

/*
 * The two lists Chain Activity is now built from (issue #346).
 *
 * These are the PAGE, not a drilldown. They used to be reachable only by
 * expanding a summary, then expanding a block row, inside a ~200px scroll
 * window -- while a third of the viewport sat empty below. A block is the wrong
 * unit for reading activity: nobody wants to open blocks one at a time to find
 * out what happened on the chain.
 *
 * Search and sort follow home/HomeOverview's DonationList, which already
 * proved out on a list of the same shape and size.
 */

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** first…last, so a 64-character id fits a column without becoming unreadable. */
function shortId(value, head = 6, tail = 6) {
  if (!value) return '—';
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function SortHeader({ label, sortKey, state, onSort, numeric = false }) {
  const active = state.key === sortKey;
  return (
    <button
      type="button"
      className={`ca-col-head${numeric ? ' ca-num' : ''}${active ? ' ca-col-head--active' : ''}`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active ? (state.ascending ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

/*
 * Shared chrome: title, count, search box, and the empty/filtered states.
 *
 * The count reads "shown / total" only while a search is narrowing it, which
 * is what tells a reader their query is doing something. A bare total when
 * nothing is filtered keeps the header quiet.
 */
function PanelShell({ title, total, shown, query, onQuery, placeholder, note, children }) {
  return (
    <section className="ca-panel">
      <header className="ca-panel-head">
        <h3 className="ca-panel-title">
          {title}
          <span className="ca-panel-count">{query ? `${fmtNum(shown)} / ${fmtNum(total)}` : fmtNum(total)}</span>
        </h3>
        <input
          className="ca-panel-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </header>
      {note}
      {children}
    </section>
  );
}

function useTable(rows, defaultKey) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: defaultKey, ascending: false });

  const onSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, ascending: !prev.ascending }
        // Heights and amounts read best highest-first; names read best A-Z.
        : { key, ascending: key === 'name' || key === 'owner' || key === 'from' }
    );

  const visible = useMemo(() => sortRows(filterRows(rows, query), sort.key, sort.ascending), [rows, query, sort]);

  return { query, setQuery, sort, onSort, visible };
}

/*
 * App deployments.
 *
 * Every column here came out of a payload the scanner was ALREADY downloading
 * and discarding -- AppSpec parsed `height` alone out of 703 KB. #346 asked for
 * detail that cost nothing extra to keep.
 *
 * NO COST COLUMN, deliberately. #346 asked for the FLUX and USD paid per
 * deployment, and an earlier pass at this shipped one -- built on payments to
 * an address that turned out to be a Stratus node collecting block rewards.
 * Those "payments" were coinbase outputs: 0.5 dev fund + 1.0 Cumulus + 3.5
 * Nimbus + 9.0 Stratus = exactly the 14 FLUX block reward, which is why they
 * looked so convincingly uniform. Attributing a deployment cost still needs
 * the v9 payment memo, exactly as #270 says.
 */
export function DeploymentsPanel({ rows, fluxPrice, truncated }) {
  const { query, setQuery, sort, onSort, visible } = useTable(rows, 'height');

  return (
    <PanelShell
      title="App deployments"
      total={rows.length}
      shown={visible.length}
      query={query}
      onQuery={setQuery}
      placeholder="Search app, owner or image"
      note={
        truncated ? (
          <p className="ca-panel-note">
            Older deployments drop out as apps are updated — {' '}
            <Tooltip2
              content="globalappsspecifications lists only current specs, so an app updated since it was deployed reports its update height instead."
              placement="bottom"
            >
              <span className="ca-panel-note-hint">why?</span>
            </Tooltip2>
          </p>
        ) : null
      }
    >
      <div className="ca-table ca-table--deployments">
        <div className="ca-row ca-row--head">
          <SortHeader label="App" sortKey="name" state={sort} onSort={onSort} />
          <SortHeader label="Owner" sortKey="owner" state={sort} onSort={onSort} />
          <SortHeader label="Inst" sortKey="instances" state={sort} onSort={onSort} numeric />
          <span className="ca-col-head">Image</span>
          <span className="ca-col-head">Resources</span>
          <SortHeader label="Block" sortKey="height" state={sort} onSort={onSort} numeric />
        </div>

        <div className="ca-rows">
          {visible.length === 0 ? (
            <div className="ca-empty">{query ? 'No deployments match that search' : 'No deployments in the retained window'}</div>
          ) : (
            visible.map((r) => (
              <div key={r.key} className="ca-row">
                <span className="ca-cell-strong" title={r.name}>{r.name || '—'}</span>
                <span className="ca-cell-dim" title={r.owner}>{shortId(r.owner, 5, 5)}</span>
                <span className="ca-num">{fmtNum(r.instances)}</span>
                <span className="ca-cell-dim" title={r.repotag}>{r.repotag || '—'}</span>
                {/*
                  Enterprise apps encrypt their resources, so the numbers arrive
                  as zeros. "0 cpu" would say the app uses nothing, which is not
                  true of any app -- resourceLabel returns "Encrypted" instead.
                */}
                <span className={r.resourcesKnown ? 'ca-cell-dim' : 'ca-cell-muted'}>{r.resources}</span>
                <span className="ca-num"><BlockLink height={r.height} hash={r.hash} /></span>
              </div>
            ))
          )}
        </div>
      </div>
    </PanelShell>
  );
}

/*
 * P2P transfers.
 *
 * from, to and amount were ALREADY stored per block (TxTransfer, #282) and
 * already rendered -- two clicks deep, spread across ~1,900px with a gap in
 * the middle. #346's ask here was purely presentational.
 */
export function TransfersPanel({ rows, fluxPrice, capped }) {
  const { query, setQuery, sort, onSort, visible } = useTable(rows, 'height');

  return (
    <PanelShell
      title="P2P transfers"
      total={rows.length}
      shown={visible.length}
      query={query}
      onQuery={setQuery}
      placeholder="Search address or transaction"
      note={
        capped ? (
          <p className="ca-panel-note">Busy blocks store their first 25 transfers; the counts above stay exact.</p>
        ) : null
      }
    >
      <div className="ca-table ca-table--transfers">
        <div className="ca-row ca-row--head">
          <span className="ca-col-head">Transaction</span>
          <SortHeader label="From" sortKey="from" state={sort} onSort={onSort} />
          <span className="ca-col-head">To</span>
          <SortHeader label="Amount" sortKey="amount" state={sort} onSort={onSort} numeric />
          <SortHeader label="Block" sortKey="height" state={sort} onSort={onSort} numeric />
        </div>

        <div className="ca-rows">
          {visible.length === 0 ? (
            <div className="ca-empty">{query ? 'No transfers match that search' : 'No transfers in the retained window'}</div>
          ) : (
            visible.map((r) => {
              const txHref = explorerTxUrl(r.txid);
              return (
                <div key={r.key} className="ca-row">
                  <span className="ca-cell-dim">
                    {txHref ? (
                      <a className="block-link" href={txHref} target="_blank" rel="noopener noreferrer" title={r.txid}>
                        {shortId(r.txid, 6, 6)}
                      </a>
                    ) : (
                      <span title={r.txid}>{shortId(r.txid, 6, 6)}</span>
                    )}
                  </span>
                  {/*
                    The explorer genuinely omits `addr` on some inputs, so
                    "unknown" is a real answer. An empty cell would read as a
                    rendering fault instead.
                  */}
                  <span className={r.from ? 'ca-cell-dim' : 'ca-cell-muted'} title={r.from || 'unknown sender'}>
                    {r.from ? shortId(r.from, 5, 5) : 'unknown'}
                  </span>
                  <span className="ca-cell-dim" title={r.to}>{shortId(r.to, 5, 5)}</span>
                  <span className="ca-num">
                    {fmtNum(r.amount, 4)}
                    {fluxPrice ? <span className="ca-fee-usd"> ${fmtNum(r.amount * fluxPrice, 2)}</span> : null}
                  </span>
                  <span className="ca-num"><BlockLink height={r.height} hash={r.hash} /></span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </PanelShell>
  );
}
