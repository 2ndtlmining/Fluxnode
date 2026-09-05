import { useEffect, useState } from 'react';
import { Spinner, Button } from '@blueprintjs/core';
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonorUnlockDialog } from 'donor/DonorUnlockDialog';
import { fetch_global_stats, fetch_total_network_utils } from 'apidata';
import { fetch_donor_nodes, sortByRank, mostRecentPayout } from 'analytics/donorNodes';
import { fetch_donor_utilization } from 'analytics/donorUtilization';
import { aggregateDonorAppsByCategory } from 'analytics/donorApps';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function fmtPct(n) {
  return `${(n || 0).toFixed(1)}%`;
}

// ── Payout card ──────────────────────────────────────────────────────────

function PayoutCard({ nextNode, lastPaidNode }) {
  return (
    <div className="hov-panel dt-payout-card">
      <div className="dt-payout-stat">
        <span className="hov-header-title">LAST PAYOUT</span>
        <span className="dt-payout-value">{lastPaidNode ? lastPaidNode.last_reward : 'Never'}</span>
        {lastPaidNode && <span className="dt-payout-caption">{lastPaidNode.ip_display}</span>}
      </div>
      <div className="dt-payout-divider" />
      <div className="dt-payout-stat">
        <span className="hov-header-title">NEXT PAYOUT</span>
        <span className="dt-payout-value">{nextNode ? nextNode.next_reward : '—'}</span>
        {nextNode && <span className="dt-payout-caption">{nextNode.ip_display}</span>}
      </div>
    </div>
  );
}

// ── His nodes ────────────────────────────────────────────────────────────

function DonorNodesList({ nodes }) {
  return (
    <div className="hov-panel dt-nodes-panel">
      <div className="hov-header">
        <span className="hov-header-title">HIS NODES</span>
        <span className="hov-header-badge">{nodes.length}</span>
      </div>
      <div className="hov-ranked-list">
        {nodes.length === 0 ? (
          <div className="hov-empty">No nodes found for this wallet</div>
        ) : (
          nodes.map((n) => (
            <div key={n.id} className="hov-ranked-row">
              <span className="dt-node-tier">{n.tier}</span>
              <span className="hov-ranked-name" title={n.ip_display}>{n.ip_display}</span>
              <span className="hov-badge">Rank {fmtNum(n.rank)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Apps by category ─────────────────────────────────────────────────────

function AppsByCategoryPanel({ categories, totalApps }) {
  const maxVal = categories[0]?.count || 1;

  return (
    <div className="hov-panel dt-apps-panel">
      <div className="hov-header">
        <span className="hov-header-title">APPS ON HIS NODES</span>
        {totalApps > 0 && <span className="hov-header-badge">{totalApps}</span>}
      </div>
      <div className="dt-apps-list">
        {categories.length === 0 ? (
          <div className="hov-empty">No running apps found</div>
        ) : (
          categories.map(({ category, count }) => {
            const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
            const { label, Icon, color } = meta;
            const barPct = (count / maxVal) * 100;
            return (
              <div key={category} className="dt-apps-row">
                <span className="dt-apps-icon" style={{ color }}>
                  <Icon size={11} />
                </span>
                <span className="dt-apps-label">{label}</span>
                <div className="dt-apps-bar-wrap">
                  <div className="dt-apps-bar-fill" style={{ width: `${barPct}%`, background: color }} />
                </div>
                <span className="hov-badge">{fmtNum(count)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Utilization comparison ───────────────────────────────────────────────

const RESOURCE_ROWS = [
  { key: 'cores', label: 'CPU Cores' },
  { key: 'ram', label: 'RAM' },
  { key: 'ssd', label: 'SSD' },
];

function UtilizationPanel({ donorUtil, networkPct }) {
  return (
    <div className="hov-panel dt-util-panel">
      <div className="hov-header">
        <span className="hov-header-title">UTILIZATION VS NETWORK AVERAGE</span>
      </div>
      {donorUtil.nodesWithCapacity === 0 ? (
        <div className="hov-empty">No capacity data available for his nodes</div>
      ) : (
        <div className="dt-util-list">
          {RESOURCE_ROWS.map(({ key, label }) => {
            const his = donorUtil[key].percentage;
            const net = networkPct[key] || 0;
            return (
              <div key={key} className="dt-util-row">
                <span className="dt-util-label">{label}</span>
                <div className="dt-util-bars">
                  <div className="dt-util-bar-wrap">
                    <div className="dt-util-bar-fill dt-util-bar-fill--his" style={{ width: `${Math.min(his, 100)}%` }} />
                  </div>
                  <span className="dt-util-figure">{fmtPct(his)} his</span>
                </div>
                <div className="dt-util-bars">
                  <div className="dt-util-bar-wrap">
                    <div className="dt-util-bar-fill dt-util-bar-fill--network" style={{ width: `${Math.min(net, 100)}%` }} />
                  </div>
                  <span className="dt-util-figure">{fmtPct(net)} network avg</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── No-wallet empty state ────────────────────────────────────────────────

function NoWalletState() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="dt-empty">
      <Lock size={28} className="dt-empty-icon" />
      <span className="dt-empty-title">No donor wallet connected</span>
      <span className="dt-empty-body">
        Unlock with a real donor wallet to see your own nodes' payout timing, apps, and utilization.
      </span>
      <Button text="Unlock" intent="primary" onClick={() => setDialogOpen(true)} />
      <DonorUnlockDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────

export function DonorTab() {
  const { donorWallet } = useDonorStatus();

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState([]);
  const [utilization, setUtilization] = useState({
    nodesWithCapacity: 0,
    cores: { utilized: 0, total: 0, percentage: 0 },
    ram: { utilized: 0, total: 0, percentage: 0 },
    ssd: { utilized: 0, total: 0, percentage: 0 },
  });
  const [appCategories, setAppCategories] = useState({ categories: [], totalApps: 0 });
  const [networkPct, setNetworkPct] = useState({ cores: 0, ram: 0, ssd: 0 });

  useEffect(() => {
    if (!donorWallet) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let cancelled = false;

    (async () => {
      const donorNodes = await fetch_donor_nodes(donorWallet);
      if (cancelled) return;
      setNodes(donorNodes);

      const addresses = donorNodes.map((n) => n.ip_display).filter(Boolean);

      // fetch_total_network_utils() already calls fetch_fluxinfo_aggregate()
      // internally and carries nodesByIp through onto its resolved gstore
      // (apidata.js's fetchTotalDeployedApps, Task 1) — read it from there
      // rather than fetching the ~726KB fluxinfo payload a second time.
      const [util, stage1] = await Promise.all([
        fetch_donor_utilization(addresses),
        fetch_global_stats(null),
      ]);
      if (cancelled) return;

      setUtilization(util);

      const gstore = await fetch_total_network_utils(stage1);
      if (cancelled) return;

      setAppCategories(aggregateDonorAppsByCategory(gstore.nodesByIp || {}, addresses));
      setNetworkPct({
        cores: gstore.utilized.cores_percentage,
        ram: gstore.utilized.ram_percentage,
        ssd: gstore.utilized.ssd_percentage,
      });

      setLoading(false);
    })().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [donorWallet]);

  if (!donorWallet) {
    return (
      <div className="donor-tab">
        <NoWalletState />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="donor-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const nextNode = sortByRank(nodes)[0] || null;
  const lastPaidNode = mostRecentPayout(nodes);

  return (
    <div className="donor-tab">
      <PayoutCard nextNode={nextNode} lastPaidNode={lastPaidNode} />
      <div className="donor-tab-panel-grid">
        <DonorNodesList nodes={nodes} />
        <AppsByCategoryPanel categories={appCategories.categories} totalApps={appCategories.totalApps} />
        <UtilizationPanel donorUtil={utilization} networkPct={networkPct} />
      </div>
    </div>
  );
}
