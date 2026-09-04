import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_global_app_specs, fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';
import { TopHostedApps } from 'components/TopHostedApps';
import { rankNodeOperators, fetch_top_node_operators, aggregateOwnerTotals } from 'analytics/topOwners';
import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from 'analytics/teamSponsored';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
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

      const [operators, specsResult] = await Promise.all([
        fetch_top_node_operators(),
        fetch_global_app_specs(builtGstore),
      ]);
      if (cancelled) return;

      setNodeOperators(operators);
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
  const ownerRows = owners.slice(0, 20).map((o) => ({ key: o.owner, value: o.totalInstances }));

  return (
    <div className="apps-tab">
      <div className="apps-tab-stat-row">
        <div className="hov-panel apps-tab-stat-card">
          <span className="hov-header-title">FLUX-TEAM-SPONSORED</span>
          <span className="apps-tab-stat-value">{sharePct.toFixed(1)}%</span>
          <span className="apps-tab-stat-caption">of network app instances run under the Flux team's own owner ID</span>
        </div>
      </div>

      <div className="apps-tab-panel-grid">
        <AppEcosystemBreakdown gstore={gstore} />
        <TopHostedApps gstore={gstore} />
        <RankedAddressList title="TOP NODE OPERATORS" rows={nodeOperatorRows} valueLabel="nodes" />
        <RankedAddressList
          title="TOP APP OWNERS"
          rows={ownerRows}
          valueLabel="instances"
          teamZelids={FLUX_TEAM_OWNER_ZELIDS}
        />
      </div>
    </div>
  );
}
