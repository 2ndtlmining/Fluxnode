import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FiBox, FiCpu, FiHardDrive, FiDatabase } from 'react-icons/fi';
import { fetch_global_app_specs, fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';
import { TopHostedApps } from 'components/TopHostedApps';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { WorkhorsePanel } from 'home/WorkhorsePanel';
import { rankNodeOperators, aggregateOwnerTotals, DEFAULT_TOP_N } from 'analytics/topOwners';
import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from 'analytics/teamSponsored';
import { buildTeamAppRows, formatExpiry } from 'analytics/teamApps';
import { PanelGate } from 'analytics/PanelGate';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

// ── Spec Header + shared helpers (moved verbatim from home/HomeOverview) ────
// Session 2 IA migration — Expiring/Deployed Today panels relocated here
// alongside App Ecosystem/Top Hosted Apps, no markup/logic changes.

function blocksToHuman(blocks) {
  const totalMinutes = Math.round(blocks * 0.5);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/*
 * Enterprise apps ship an encrypted compose, so their CPU / RAM / SSD are
 * genuinely unknown — not zero. Render an em dash rather than a confident 0.00.
 */
function fmtSpecVal(value, suffix) {
  if (value == null) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

function SpecHeader() {
  return (
    <div className="hov-spec-header">
      <span className="hov-spec-header__name">Name</span>
      <span className="hov-spec-header__cat">Cat</span>
      <span className="hov-spec-header__inst">Inst</span>
      <span className="hov-spec-header__val">CPU</span>
      <span className="hov-spec-header__val">RAM</span>
      <span className="hov-spec-header__val">SSD</span>
      <span className="hov-spec-header__time">Time</span>
    </div>
  );
}

function SpecCategoryIcon({ category }) {
  const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
  const { Icon, color } = meta;
  const tooltip = <CategoryTooltip category={category} />;
  return (
    <Tooltip2 content={tooltip} placement="top" hoverOpenDelay={200} popoverClassName="hov-cat-tooltip">
      <span className="hov-spec-cat" style={{ color }}>
        <Icon size={11} />
      </span>
    </Tooltip2>
  );
}

function ExpiringTodayPanel({ appSpecs }) {
  if (!appSpecs) {
    return (
      <div className="hov-panel hov-panel-center">
        <Spinner size={24} />
      </div>
    );
  }

  const items = appSpecs.expiringToday || [];

  return (
    <div className="hov-panel hov-panel--expiring">
      <div className="hov-header">
        <span className="hov-header-title">EXPIRING TODAY</span>
        {items.length > 0 && <span className="hov-header-badge">{items.length}</span>}
      </div>
      {items.length > 0 && <SpecHeader />}
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None expiring today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <SpecCategoryIcon category={spec.category} />
              <span className="hov-badge hov-badge--warn">{spec.instances}×</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.cpuPerInst, 'c')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ramGBPerInst, 'GB')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ssdGBPerInst, 'GB')}</span>
              <span className="hov-time hov-time--warn">in {blocksToHuman(spec.expiresInBlocks)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DeployedTodayPanel({ appSpecs }) {
  if (!appSpecs) {
    return (
      <div className="hov-panel hov-panel-center">
        <Spinner size={24} />
      </div>
    );
  }

  const items = appSpecs.deployedToday || [];

  return (
    <div className="hov-panel hov-panel--deployed">
      <div className="hov-header">
        <span className="hov-header-title">DEPLOYED TODAY</span>
        {items.length > 0 && <span className="hov-header-badge">{items.length}</span>}
      </div>
      {items.length > 0 && <SpecHeader />}
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None deployed today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <SpecCategoryIcon category={spec.category} />
              <span className="hov-badge hov-badge--green">{spec.instances}×</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.cpuPerInst, 'c')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ramGBPerInst, 'GB')}</span>
              <span className="hov-spec-val">{fmtSpecVal(spec.ssdGBPerInst, 'GB')}</span>
              <span className="hov-time hov-time--green">{blocksToHuman(spec.deployedAgeBlocks)} ago</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RankedAddressList({ title, rows, valueLabel, teamZelids = [] }) {
  const maxVal = rows[0]?.value || 1;
  return (
    <div className="hov-panel apps-tab-ranked-panel">
      <div className="hov-header">
        <span className="hov-header-title">{title}</span>
      </div>
      <div className="hov-ranked-list">
        {rows.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          rows.map(({ key, value }, i) => (
            <div key={key} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name" title={key}>
                {truncateAddr(key)}
                {teamZelids.includes(key) && <span className="apps-tab-team-flag">Flux team</span>}
              </span>
              <div className="hov-ranked-bar-wrap">
                <div className="hov-ranked-bar-fill" style={{ width: `${(value / maxVal) * 100}%` }} />
              </div>
              <span className="hov-badge">{fmtNum(value)} {valueLabel}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function fmtDec(n, digits = 1) {
  if (n == null) return '\u2014';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

/* One cell of the KPI strip. Passing `onClick` turns it into a real button. */
function KpiTile({ value, label, hint, onClick, expanded }) {
  const body = (
    <>
      <span className="apps-kpi-value">{value}</span>
      <span className="apps-kpi-label">
        {label}
        {hint && <span className="apps-kpi-hint" aria-hidden="true">{'\u24d8'}</span>}
      </span>
    </>
  );

  const tile = onClick ? (
    <button
      type="button"
      className={`hov-panel apps-kpi apps-kpi--interactive${expanded ? ' apps-kpi--expanded' : ''}`}
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="apps-team-detail"
    >
      {body}
      <span className="apps-kpi-chevron" aria-hidden="true">{expanded ? '\u25b4' : '\u25be'}</span>
    </button>
  ) : (
    <div className="hov-panel apps-kpi">{body}</div>
  );

  return hint ? (
    <Tooltip2 content={hint} placement="bottom" hoverOpenDelay={200} transitionDuration={80}>
      {tile}
    </Tooltip2>
  ) : tile;
}

/*
 * The apps behind the Flux-team-sponsored percentage.
 *
 * The stat alone asserts that one owner runs roughly half the network's ordered
 * instances, with no way to check it. This is the evidence: which apps, how many
 * instances each, and what they cost. Sorted by instance count because that is
 * what the percentage is made of -- one app at 100 instances outweighs fifty at
 * one instance each.
 */
function TeamAppCard({ row }) {
  const meta = APP_CATEGORY_META[row.category] || APP_CATEGORY_META.other;
  const CatIcon = meta.Icon || FiBox;
  const expiry = formatExpiry(row.expiresInBlocks);
  const expired = expiry === 'expired';

  return (
    <div className="atc-card">
      <div className="atc-head">
        <span className="atc-name" title={row.name}>{row.name}</span>
        <Tooltip2
          content={<CategoryTooltip category={row.category} />}
          placement="top"
          hoverOpenDelay={200}
          popoverClassName="hov-cat-tooltip"
        >
          {/* Same chip treatment as WorkhorsePanel's .whp-cat and the ecosystem
              breakdown below, so one app reads identically wherever it appears. */}
          <span className="atc-cat" style={{ borderColor: `${meta.color}44` }}>
            <span style={{ color: meta.color, display: 'inline-flex' }}><CatIcon size={10} /></span>
            {meta.label}
          </span>
        </Tooltip2>
      </div>

      <div className="atc-repo" title={row.repotag || ''}>
        {row.repotag || (row.isEnterprise
          ? <span className="atc-muted">encrypted specification</span>
          : '—')}
      </div>

      <div className="atc-foot">
        <span className="atc-instances">
          {fmtNum(row.instances)}<small>{row.instances === 1 ? ' instance' : ' instances'}</small>
        </span>

        {/* Per-instance only. The fleet total each app accounts for is now in
            the panel header, not repeated on every card -- "1 / 100" read as a
            fraction and was the original complaint in #229. */}
        <span className="atc-res">
          <FiCpu size={10} />{fmtDec(row.cpuPerInst)}
          <i>·</i>
          <FiHardDrive size={10} />{fmtDec(row.ramGBPerInst)} GB
          <i>·</i>
          <FiDatabase size={10} />{fmtDec(row.ssdGBPerInst, 0)} GB
        </span>

        <span className={`atc-expiry${expired ? ' atc-expiry--expired' : ''}`}>
          {expiry || '—'}
        </span>
      </div>
    </div>
  );
}

/*
 * The apps behind the Flux-team-sponsored percentage.
 *
 * The stat alone asserts that one owner runs roughly half the network's ordered
 * instances, with no way to check it. This is the evidence: which apps, how many
 * instances each, and what they reserve. Sorted by instance count because that
 * is what the percentage is made of -- one app at 100 instances outweighs fifty
 * at one instance each.
 *
 * A card grid rather than a table (issue #229): the seven-column table it
 * replaced stretched the full panel width for four short values per row, and
 * rendered each resource as "per-instance / fleet-total", which read as a
 * fraction. Cards reflow by width, and the fleet totals live once in the header
 * where a total belongs.
 */
function TeamAppsDetail({ rawSpecs, currentBlock }) {
  const { rows, totalApps, totalInstances, totalCpu, totalRamGB, totalSsdGB } =
    buildTeamAppRows(rawSpecs, currentBlock);

  if (rows.length === 0) {
    return (
      <div className="hov-panel apps-team-detail" id="apps-team-detail">
        <div className="hov-empty">No Flux-team-owned apps found in the current spec set</div>
      </div>
    );
  }

  return (
    <div className="hov-panel apps-team-detail" id="apps-team-detail">
      <div className="hov-header">
        <span className="hov-header-title">FLUX-TEAM-SPONSORED APPS</span>
        <span className="hov-header-badge">
          {fmtNum(totalApps)} apps &middot; {fmtNum(totalInstances)} instances
        </span>
      </div>

      {/* The fleet totals the table footer used to carry. One row, once. */}
      <div className="atc-fleet">
        <span>Fleet reserves</span>
        <strong>{fmtDec(totalCpu)}</strong> cores
        <i>·</i>
        <strong>{fmtDec(totalRamGB)}</strong> GB RAM
        <i>·</i>
        <strong>{fmtDec(totalSsdGB, 0)}</strong> GB SSD
      </div>

      <div className="atc-grid">
        {rows.map((row) => <TeamAppCard key={row.name} row={row} />)}
      </div>

      <div className="apps-team-caption">
        Figures are what each app reserves <strong>per instance</strong> &mdash; CPU in
        cores, RAM and SSD in GB. Expiry is derived from each spec&apos;s height +
        expire against the current block, at the 30-second block target.
      </div>
    </div>
  );
}

export function AppsTab() {
  const [gstore, setGstore] = useState(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [appSpecs, setAppSpecs] = useState(null);
  const [nodeOperators, setNodeOperators] = useState([]);
  const [ownerTotals, setOwnerTotals] = useState({ owners: [], networkTotalInstances: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Same two-call sequence Home.jsx's hydrateApp() uses for its
      // no-wallet (network-wide) case — see Step 1's note on why
      // AppsTab doesn't need any of Home's other parallel fetches.
      const stage1 = await fetch_global_stats(null);
      if (cancelled) return;
      const builtGstore = await fetch_total_network_utils(stage1);
      if (cancelled) return;
      setGstore(builtGstore);

      const specsResult = await fetch_global_app_specs(builtGstore);
      if (cancelled) return;
      setAppSpecs(specsResult);

      setNodeOperators(rankNodeOperators(builtGstore.nodePaymentAddresses));
      setOwnerTotals(aggregateOwnerTotals(specsResult.rawSpecs));
      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading || !gstore) {
    return (
      <div className="apps-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const { owners, networkTotalInstances } = ownerTotals;
  const distinctApps = Array.isArray(appSpecs?.rawSpecs) ? appSpecs.rawSpecs.length : 0;
  const appOwners = owners.length;
  const { sharePct } = computeTeamSponsoredShare(owners, networkTotalInstances);

  const nodeOperatorRows = nodeOperators.map((o) => ({ key: o.address, value: o.nodeCount }));
  const ownerRows = owners.slice(0, DEFAULT_TOP_N).map((o) => ({ key: o.owner, value: o.totalInstances }));

  return (
    <div className="apps-tab">
      {/*
        * One KPI strip, replacing a hero row and a stat row that each sat
        * almost entirely empty. The team-sponsored tile is a button: clicking
        * it expands the apps behind the percentage at full width, because a
        * seven-column table cannot live in a grid cell.
        */}
      <div className="apps-kpi-strip">
        <KpiTile value={fmtNum(networkTotalInstances)} label="Ordered app instances" />
        <KpiTile value={fmtNum(distinctApps)} label="Distinct apps" />
        <KpiTile value={fmtNum(appOwners)} label="App owners" />
        <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored stat" preview="blur">
          <KpiTile
            value={`${sharePct.toFixed(1)}%`}
            label="Flux-team-sponsored"
            hint={`Share of all ${fmtNum(networkTotalInstances)} ordered app instances whose spec owner is the Flux team's own ZelID (${FLUX_TEAM_OWNER_ZELIDS.join(', ')}). Owner IDs are ZelIDs, not payment addresses. Click to see the apps.`}
            onClick={() => setTeamOpen((open) => !open)}
            expanded={teamOpen}
          />
        </PanelGate>
      </div>

      {teamOpen && (
        <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored apps" preview="blur">
          <TeamAppsDetail rawSpecs={appSpecs.rawSpecs} currentBlock={gstore?.fluxBlockHeight || 0} />
        </PanelGate>
      )}

      <div className="apps-tab-panel-grid">
        <PanelGate panelKey="appEcosystem" feature="App Ecosystem" preview="blur">
          <AppEcosystemBreakdown gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topHostedApps" feature="Top Hosted Apps" preview="blur">
          <TopHostedApps gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topNodeOperators" feature="Top Node Operators" preview="blur">
          <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        </PanelGate>
        <PanelGate panelKey="topAppOwners" feature="Top App Owners" preview="blur">
          <RankedAddressList
            title="TOP APP OWNERS"
            rows={ownerRows}
            valueLabel="instances"
            teamZelids={FLUX_TEAM_OWNER_ZELIDS}
          />
        </PanelGate>
        <PanelGate panelKey="expiringToday" feature="Expiring Today">
          <ExpiringTodayPanel appSpecs={appSpecs} />
        </PanelGate>
        <PanelGate panelKey="deployedToday" feature="Deployed Today">
          <DeployedTodayPanel appSpecs={appSpecs} />
        </PanelGate>
      </div>

      <PanelGate panelKey="workhorse" feature="Workhorse">
        <WorkhorsePanel gstore={gstore} appSpecs={appSpecs} />
      </PanelGate>
    </div>
  );
}
