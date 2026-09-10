import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { fetch_global_app_specs, fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';
import { TopHostedApps } from 'components/TopHostedApps';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { WorkhorsePanel } from 'home/WorkhorsePanel';
import { rankNodeOperators, aggregateOwnerTotals, DEFAULT_TOP_N } from 'analytics/topOwners';
import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from 'analytics/teamSponsored';
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

export function AppsTab() {
  const [gstore, setGstore] = useState(null);
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
    })();

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
  const { sharePct } = computeTeamSponsoredShare(owners, networkTotalInstances);

  const nodeOperatorRows = nodeOperators.map((o) => ({ key: o.address, value: o.nodeCount }));
  const ownerRows = owners.slice(0, DEFAULT_TOP_N).map((o) => ({ key: o.owner, value: o.totalInstances }));

  return (
    <div className="apps-tab">
      <div className="apps-tab-stat-row">
        <PanelGate panelKey="appsTeamSponsoredStat" feature="Flux-team-sponsored stat">
          <div className="hov-panel apps-tab-stat-card">
            <span className="hov-header-title">FLUX-TEAM-SPONSORED</span>
            <span className="apps-tab-stat-value">{sharePct.toFixed(1)}%</span>
            <span className="apps-tab-stat-caption">
              of {fmtNum(networkTotalInstances)} ordered app instances run under the Flux team's own owner ID
            </span>
          </div>
        </PanelGate>
      </div>

      <div className="apps-tab-panel-grid">
        <PanelGate panelKey="appEcosystem" feature="App Ecosystem">
          <AppEcosystemBreakdown gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topHostedApps" feature="Top Hosted Apps">
          <TopHostedApps gstore={gstore} />
        </PanelGate>
        <PanelGate panelKey="topNodeOperators" feature="Top Node Operators">
          <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        </PanelGate>
        <PanelGate panelKey="topAppOwners" feature="Top App Owners">
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
