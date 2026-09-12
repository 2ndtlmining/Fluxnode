import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import { fetch_global_stats, fetch_total_network_utils, fetch_global_app_specs_raw } from 'apidata';
import { buildSpecIndex } from 'appSpecs';
import { fetch_donor_nodes, sortByRank, mostRecentPayout } from 'analytics/donorNodes';
import { fetch_donor_utilization } from 'analytics/donorUtilization';
import { aggregateDonorAppsByCategory } from 'analytics/donorApps';
import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { fetch_wallet_tx_history } from 'analytics/walletTxFetch';
import { counterpartyDisplay, WINDOW_DAYS } from 'analytics/walletTxHistory';
import { RewardCountdown } from 'rewards/RewardCountdown';
import { rewardImpact, tallyWalletTiers } from 'rewards/rewardReduction';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function fmtPct(n) {
  return `${(n || 0).toFixed(1)}%`;
}


function fmtFlux(n) {
  if (n == null) return '\u2014';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txTime(unixSeconds) {
  if (!unixSeconds) return '\u2014';
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/*
 * The wallet's last WINDOW_DAYS of on-chain activity.
 *
 * Grouped by DIRECTION first, then type. "Payments sent" and "P2P" overlap --
 * a payment you send is a P2P transfer -- so a flat list of types would
 * double-count or need an arbitrary precedence rule. In/out/net is also the
 * question someone actually has about their own address.
 *
 * Counterparties are named from a checked-in address book (exchanges and the
 * Flux Foundation, from the fluxflow repo). An unknown counterparty shows as a
 * shortened address rather than being guessed at.
 */
function WalletActivityPanel({ walletAddress }) {
  const [state, setState] = useState({ status: 'loading', summary: null });

  useEffect(() => {
    if (!walletAddress) return undefined;
    let cancelled = false;
    setState({ status: 'loading', summary: null });
    (async () => {
      const result = await fetch_wallet_tx_history(walletAddress);
      if (cancelled) return;
      setState({ status: result.ok ? 'ready' : 'error', summary: result.summary });
    })().catch(() => {
      if (!cancelled) setState({ status: 'error', summary: null });
    });
    return () => { cancelled = true; };
  }, [walletAddress]);

  if (state.status === 'loading') {
    return (
      <div className="hov-panel dt-activity-panel">
        <div className="hov-header"><span className="hov-header-title">RECENT ACTIVITY</span></div>
        <div className="hov-empty">Loading recent transactions...</div>
      </div>
    );
  }

  if (state.status === 'error' || !state.summary) {
    return (
      <div className="hov-panel dt-activity-panel">
        <div className="hov-header"><span className="hov-header-title">RECENT ACTIVITY</span></div>
        <div className="hov-empty">Could not load transaction history right now.</div>
      </div>
    );
  }

  const { received, sent, net, rows } = state.summary;

  return (
    <div className="hov-panel dt-activity-panel">
      <div className="hov-header">
        <span className="hov-header-title">RECENT ACTIVITY</span>
        <span className="hov-header-badge">last {WINDOW_DAYS} days</span>
      </div>

      <div className="dt-activity-summary">
        <div className="dt-activity-col">
          <span className="dt-activity-col-title">Received</span>
          <div className="dt-activity-line"><span>Node rewards</span><strong>{fmtFlux(received.rewards)}</strong></div>
          <div className="dt-activity-line"><span>From exchanges</span><strong>{fmtFlux(received.exchange)}</strong></div>
          <div className="dt-activity-line"><span>From Flux Foundation</span><strong>{fmtFlux(received.foundation)}</strong></div>
          <div className="dt-activity-line"><span>Transfers in</span><strong>{fmtFlux(received.transfers)}</strong></div>
          <div className="dt-activity-line dt-activity-line--total"><span>Total in</span><strong>{fmtFlux(received.total)}</strong></div>
        </div>

        <div className="dt-activity-col">
          <span className="dt-activity-col-title">Sent</span>
          <div className="dt-activity-line"><span>To exchanges</span><strong>{fmtFlux(sent.exchange)}</strong></div>
          <div className="dt-activity-line"><span>To Flux Foundation</span><strong>{fmtFlux(sent.foundation)}</strong></div>
          <div className="dt-activity-line"><span>Transfers out</span><strong>{fmtFlux(sent.transfers)}</strong></div>
          <div className="dt-activity-line"><span /><strong /></div>
          <div className="dt-activity-line dt-activity-line--total"><span>Total out</span><strong>{fmtFlux(sent.total)}</strong></div>
        </div>
      </div>

      <div className={`dt-activity-net${net >= 0 ? ' dt-activity-net--up' : ' dt-activity-net--down'}`}>
        net {net >= 0 ? '+' : '\u2212'}{fmtFlux(Math.abs(net))} FLUX over {WINDOW_DAYS} days
      </div>

      <div className="dt-activity-list">
        {rows.length === 0 ? (
          <div className="hov-empty">No transactions in the last {WINDOW_DAYS} days</div>
        ) : (
          rows.map((row) => (
            <div key={row.txid} className="dt-activity-row">
              <span className="dt-activity-date">{txTime(row.time)}</span>
              <span className={`dt-activity-party dt-activity-party--${row.counterpartyKind || 'unknown'}`}>
                {counterpartyDisplay(row)}
              </span>
              <span className={`dt-activity-amount dt-activity-amount--${row.direction}`}>
                {row.direction === 'in' ? '+' : '\u2212'}{fmtFlux(row.amount)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="dt-activity-caption">
        Counterparties are named where the address is known (exchanges, Flux
        Foundation). Flux app payments go to a Foundation address, so they appear
        under Flux Foundation rather than as a separate deployment category.
      </div>
    </div>
  );
}

// ── Payout card ──────────────────────────────────────────────────────────


function fmtSigned(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/*
 * What the next block-reward reduction costs THIS wallet (issue #240).
 *
 * The countdown alone says when; this says how much. Figures are modelled with
 * network node counts held constant -- they will change by October, but
 * projecting network growth would mean presenting a guess as a number. The
 * honest question this answers is "what does the reduction itself do".
 *
 * USD is shown only when a price is actually available: flux_price_usd falls
 * back to 0 when the currency fetch is rate-limited (#189), and a column of
 * $0.00 reads as "worthless" rather than "unknown".
 */
function RewardImpactPanel({ nodes, gstore }) {
  const tiers = tallyWalletTiers(nodes);
  const nodeTotal = tiers.CUMULUS + tiers.NIMBUS + tiers.STRATUS;
  const price = gstore?.flux_price_usd || 0;
  const impact = rewardImpact(tiers, gstore?.node_count, price);

  if (!impact) return null;

  if (nodeTotal === 0) {
    return (
      <div className="hov-panel dt-impact-panel">
        <div className="hov-header"><span className="hov-header-title">REWARD REDUCTION IMPACT</span></div>
        <div className="hov-empty">No nodes found for this wallet, so there is nothing to project.</div>
      </div>
    );
  }

  const rows = [
    ['Daily', impact.daily],
    ['Weekly', impact.weekly],
    ['Monthly', impact.monthly]
  ];

  return (
    <div className="hov-panel dt-impact-panel">
      <div className="hov-header">
        <span className="hov-header-title">REWARD REDUCTION IMPACT</span>
        <span className="hov-header-badge">
          {impact.currentBlockReward} &rarr; {impact.reducedBlockReward} FLUX / block
        </span>
      </div>

      <div className="dt-impact-headline">
        <span className="dt-impact-pct">{fmtSigned(impact.pctChange, 1)}%</span>
        <span className="dt-impact-sub">
          on {nodeTotal} node{nodeTotal === 1 ? '' : 's'} at block{' '}
          {impact.reductionBlock.toLocaleString()}
        </span>
      </div>

      <table className="dt-impact-table">
        <thead>
          <tr>
            <th />
            <th className="dt-impact-num">Now</th>
            <th className="dt-impact-num">After</th>
            <th className="dt-impact-num">Change</th>
            {price > 0 && <th className="dt-impact-num">Change ($)</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, p]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="dt-impact-num">{p.current.toFixed(2)}</td>
              <td className="dt-impact-num">{p.reduced.toFixed(2)}</td>
              <td className="dt-impact-num dt-impact-down">{fmtSigned(p.delta)}</td>
              {price > 0 && (
                <td className="dt-impact-num dt-impact-down">${fmtSigned(p.deltaUsd)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dt-impact-tiers">
        {Object.entries(impact.perTier).map(([tier, t]) => (
          <span key={tier} className="dt-impact-chip">
            {tier.charAt(0) + tier.slice(1).toLowerCase()} &times;{t.nodes}
            <strong>{fmtSigned(t.deltaDaily)}</strong>
            <small>FLUX/day</small>
          </span>
        ))}
      </div>

      <div className="dt-impact-caption">
        FLUX amounts, with network node counts held at today&apos;s levels.
        {price > 0
          ? ` Dollar values at the current ${price.toFixed(4)} USD price.`
          : ' Dollar values hidden while the price feed is unavailable.'}
      </div>
    </div>
  );
}

/*
 * The three time-based facts on this tab, in one band (issue #288).
 *
 * The two payout stats had a full-width panel to themselves and the reward
 * countdown had another below it, so the tab opened with two mostly-empty rows
 * -- each stat was given half a 2,100px panel to hold about 300px of text.
 * Putting the countdown in alongside them fills the row with the thing that
 * belongs there anyway: when you were last paid, when you are next paid, and
 * when the reward itself changes.
 */
function PayoutCard({ nextNode, lastPaidNode, currentBlock }) {
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
      {/*
        RewardCountdown removes itself when no reduction is scheduled, so the
        divider is rendered by the clock's own wrapper rather than here -- an
        absent clock must not leave a dangling rule behind it.
      */}
      <RewardCountdown currentBlock={currentBlock} compact />
    </div>
  );
}

// ── Your nodes ────────────────────────────────────────────────────────────

function DonorNodesList({ nodes }) {
  return (
    <div className="hov-panel dt-nodes-panel">
      <div className="hov-header">
        <span className="hov-header-title">YOUR NODES</span>
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
        <span className="hov-header-title">APPS ON YOUR NODES</span>
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
        <div className="hov-empty">No capacity data available for your nodes</div>
      ) : (
        <div className="dt-util-list">
          {RESOURCE_ROWS.map(({ key, label }) => {
            const yours = donorUtil[key].percentage;
            const net = networkPct[key] || 0;
            return (
              <div key={key} className="dt-util-row">
                <span className="dt-util-label">{label}</span>
                <div className="dt-util-bars">
                  <div className="dt-util-bar-wrap">
                    <div className="dt-util-bar-fill dt-util-bar-fill--yours" style={{ width: `${Math.min(yours, 100)}%` }} />
                  </div>
                  <span className="dt-util-figure">{fmtPct(yours)} yours</span>
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
  return (
    <div className="dt-empty">
      <Lock size={28} className="dt-empty-icon" />
      <span className="dt-empty-title">No donor wallet connected</span>
      <span className="dt-empty-body">
        Unlock with a real donor wallet to see your own nodes' payout timing, apps, and utilization.
      </span>
      <PremiumUnlock />
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
  /*
   * The loader already fetches the global store for utilisation and app
   * categories, but only kept derived slices of it. The reward-reduction
   * panels (issue #240) need current_block_height, node_count and
   * flux_price_usd, so it is held rather than discarded -- no extra fetch.
   */
  const [gstore, setGstore] = useState(null);

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

      // Named distinctly from the `gstore` state above: shadowing it here
      // compiles and behaves correctly, but reads as though setGstore were
      // being handed the state variable rather than the fetched one.
      const [fetchedStore, rawSpecs] = await Promise.all([
        fetch_total_network_utils(stage1),
        fetch_global_app_specs_raw(),
      ]);
      if (cancelled) return;

      const specIndex = buildSpecIndex(rawSpecs);
      setAppCategories(aggregateDonorAppsByCategory(fetchedStore.nodesByIp || {}, addresses, specIndex));
      setGstore(fetchedStore);
      setNetworkPct({
        cores: fetchedStore.utilized.cores_percentage,
        ram: fetchedStore.utilized.ram_percentage,
        ssd: fetchedStore.utilized.ssd_percentage,
      });

      setLoading(false);
    })().catch((error) => {
      console.warn('[DonorTab] failed to load donor data:', error?.message);
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
      <div className="dt-tab-hero">
        <span className="dt-tab-hero-value">{nextNode ? nextNode.next_reward : '—'}</span>
        <span className="dt-tab-hero-label">Next payout</span>
      </div>
      <PayoutCard
        nextNode={nextNode}
        lastPaidNode={lastPaidNode}
        currentBlock={gstore?.current_block_height}
      />
      <div className="donor-tab-panel-grid">
        <DonorNodesList nodes={nodes} />
        <AppsByCategoryPanel categories={appCategories.categories} totalApps={appCategories.totalApps} />
        <UtilizationPanel donorUtil={utilization} networkPct={networkPct} />
        <RewardImpactPanel nodes={nodes} gstore={gstore} />
        <WalletActivityPanel walletAddress={donorWallet} />
      </div>
    </div>
  );
}
