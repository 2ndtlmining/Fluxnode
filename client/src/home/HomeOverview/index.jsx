import React from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { FiCpu, FiDatabase, FiLink, FiBox, FiZap, FiShield, FiActivity, FiHardDrive, FiDownload, FiUpload } from 'react-icons/fi';
import { FaGamepad, FaTrophy } from 'react-icons/fa';
import ReactCountryFlag from 'react-country-flag';

import { CC_COLLATERAL_CUMULUS, CC_COLLATERAL_NIMBUS, CC_COLLATERAL_STRATUS } from 'content';
import { fluxos_version_string } from 'main/flux_version';

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORY_TOOLTIPS = {
  computing:     'Volunteer & distributed computing (Folding@Home, BOINC, Gridcoin)',
  gaming:        'Game servers (Minecraft, Valheim, Factorio, CS:GO)',
  communication: 'Chat & messaging servers (Matrix, Conduit, Mattermost, Jitsi)',
  web:           'Web apps & CMS (WordPress, Nextcloud, Ghost, Nginx)',
  blockchain:    'Blockchain nodes & explorers (Bitcoin, Ethereum, Kaspa, Kadena, Firo)',
  database:      'Database servers (MySQL, PostgreSQL, Redis, MongoDB)',
  devops:        'CI/CD & DevOps tools (Gitea, Jenkins, Woodpecker, Act)',
  media:         'Media servers (Jellyfin, Plex, Navidrome, Emby)',
  ai:            'AI & machine learning workloads (Ollama, LocalAI, ComfyUI)',
  vpn:           'VPN, privacy & decentralised search (Presearch, WireGuard, Shadowsocks)',
  monitoring:    'Observability & monitoring (Grafana, Prometheus, Uptime-Kuma, Netdata)',
  other:         'Other / uncategorized applications',
};

const APP_CATEGORY_META = {
  computing:     { label: 'Computing',     Icon: FiCpu,      color: '#6366f1' },
  gaming:        { label: 'Gaming',         Icon: FaGamepad,  color: '#10b981' },
  communication: { label: 'Communication', Icon: FiLink,     color: '#3b82f6' },
  web:           { label: 'Web / CMS',     Icon: FiBox,      color: '#f59e0b' },
  blockchain:    { label: 'Blockchain',    Icon: FiLink,     color: '#8b5cf6' },
  database:      { label: 'Database',      Icon: FiDatabase, color: '#06b6d4' },
  devops:        { label: 'DevOps / CI',   Icon: FiBox,      color: '#84cc16' },
  media:         { label: 'Media',         Icon: FiZap,      color: '#f43f5e' },
  ai:            { label: 'AI / ML',       Icon: FiCpu,      color: '#a78bfa' },
  vpn:           { label: 'VPN / Privacy', Icon: FiShield,   color: '#0ea5e9' },
  monitoring:    { label: 'Monitoring',    Icon: FiActivity, color: '#f97316' },
  other:         { label: 'Other',         Icon: FiBox,      color: '#94a3b8' },
};

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtCompact(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toFixed(0);
}

function blocksToHuman(blocks) {
  const totalMinutes = Math.round(blocks * 0.5);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function shortImageName(image) {
  return image
    .replace(/^(docker\.io\/|registry\.hub\.docker\.com\/)/, '')
    .replace(/^library\//, '')
    .split(':')[0];
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function PanelHeader({ title, badge, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {right}
      {badge != null && <span className="hov-header-badge">{fmtNum(badge)}</span>}
    </div>
  );
}

// ── CPU Demand Indicator ───────────────────────────────────────────────────────

const DEMAND_LEVELS = [
  { max: 10,  color: '#d1d5db', border: true,  label: 'Low Demand'      },
  { max: 25,  color: '#ef4444', border: false, label: 'Light Demand'    },
  { max: 50,  color: '#22c55e', border: false, label: 'Moderate Demand' },
  { max: 75,  color: '#f97316', border: false, label: 'High Demand'     },
  { max: 101, color: '#8b5cf6', border: false, label: 'Extreme Demand'  },
];

function DemandIndicator({ pct }) {
  if (pct == null || pct === 0) return null;
  const level = DEMAND_LEVELS.find((l) => pct < l.max) || DEMAND_LEVELS[DEMAND_LEVELS.length - 1];
  return (
    <Tooltip2
      content={`${level.label} — CPU ${pct.toFixed(1)}% utilized`}
      placement="top"
      hoverOpenDelay={150}
    >
      <span
        className="hov-demand-dot"
        style={{
          background: level.color,
          boxShadow: level.border ? '0 0 0 1.5px #9ca3af' : 'none',
        }}
      />
    </Tooltip2>
  );
}

function ThinBar({ pct, color }) {
  const clamped = Math.min(100, Math.max(0, pct || 0));
  return (
    <div className="hov-thin-bar-track">
      <div className="hov-thin-bar-fill" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

// ── Panel 1: Flux Network Stats ───────────────────────────────────────────────

function NetworkStatsPanel({ gstore }) {
  const { cumulus, nimbus, stratus, total } = gstore.node_count;
  const safeTotal = total || 1;

  const tiers = [
    { label: 'Cumulus', count: cumulus, pct: (cumulus / safeTotal) * 100, color: '#2686d0' },
    { label: 'Nimbus',  count: nimbus,  pct: (nimbus  / safeTotal) * 100, color: '#d07e26' },
    { label: 'Stratus', count: stratus, pct: (stratus / safeTotal) * 100, color: '#c92641' },
  ];

  const lockedSupply =
    cumulus * CC_COLLATERAL_CUMULUS +
    nimbus  * CC_COLLATERAL_NIMBUS  +
    stratus * CC_COLLATERAL_STRATUS;

  return (
    <div className="hov-panel hov-panel--stats">
      <PanelHeader title="FLUX NETWORK" badge={total} />

      <div className="hov-tier-list">
        {tiers.map(({ label, count, pct, color }) => (
          <div key={label} className="hov-tier-row">
            <span className="hov-tier-dot" style={{ background: color }} />
            <span className="hov-tier-label" style={{ color }}>{label}</span>
            <ThinBar pct={pct} color={color} />
            <span className="hov-tier-count">{fmtNum(count)}</span>
            <span className="hov-tier-pct">{pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <div className="hov-divider" />

      <div className="hov-kv-list">
        <div className="hov-kv-row">
          <span className="hov-kv-label">Locked Supply</span>
          <span className="hov-kv-value hov-locked">{fmtCompact(lockedSupply)} FLUX</span>
        </div>
        <div className="hov-kv-row">
          <span className="hov-kv-label">Unique Wallets</span>
          <span className="hov-kv-value">{fmtNum(gstore.uniqueWalletAddressesCount)}</span>
        </div>
        <div className="hov-kv-row">
          <span className="hov-kv-label">FLUX Price</span>
          <span className="hov-kv-value hov-green">
            {gstore.flux_price_usd > 0 ? `$${gstore.flux_price_usd.toFixed(3)}` : '—'}
          </span>
        </div>
        <div className="hov-kv-row">
          <span className="hov-kv-label">Block Height</span>
          <span className="hov-kv-value">
            {gstore.current_block_height > 0 ? fmtNum(gstore.current_block_height) : '—'}
          </span>
        </div>
        <div className="hov-kv-row">
          <span className="hov-kv-label">FluxOS Version</span>
          <span className="hov-kv-value">
            {gstore.fluxos_latest_version?.major > 0
              ? fluxos_version_string(gstore.fluxos_latest_version)
              : '—'}
          </span>
        </div>
        <div className="hov-kv-row">
          <span className="hov-kv-label">Bench Version</span>
          <span className="hov-kv-value">
            {gstore.bench_latest_version?.major > 0
              ? fluxos_version_string(gstore.bench_latest_version)
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Panel 2: Network Resources ─────────────────────────────────────────────────

function ResourceRow({ label, pct, utilized, total, unit, color = '#2686d0' }) {
  return (
    <div className="hov-res-row">
      <div className="hov-res-header">
        <span className="hov-res-label">{label}</span>
        <span className="hov-res-pct">{pct ? pct.toFixed(1) : '0.0'}%</span>
      </div>
      <ThinBar pct={pct} color={color} />
      {total > 0 && (
        <div className="hov-res-numbers">
          {fmtCompact(utilized)} / {fmtCompact(total)} {unit}
        </div>
      )}
    </div>
  );
}

function NetworkResourcesPanel({ gstore }) {
  const { utilized, total, node_count, arcane_os } = gstore;

  return (
    <div className="hov-panel hov-panel--resources">
      <PanelHeader
        title="NETWORK RESOURCES"
        right={<DemandIndicator pct={utilized.cores_percentage} />}
      />

      <ResourceRow
        label="CPU Cores"
        pct={utilized.cores_percentage}
        utilized={utilized.cores}
        total={total.cores}
        unit="cores"
        color="#6366f1"
      />
      <ResourceRow
        label="RAM"
        pct={utilized.ram_percentage}
        utilized={utilized.ram}
        total={total.ram}
        unit="TB"
        color="#3b82f6"
      />
      <ResourceRow
        label="SSD"
        pct={utilized.ssd_percentage}
        utilized={utilized.ssd}
        total={total.ssd}
        unit="TB"
        color="#06b6d4"
      />
      <ResourceRow
        label="Active Nodes"
        pct={utilized.nodes_percentage}
        utilized={utilized.nodes}
        total={node_count.total}
        unit="nodes"
        color="#10b981"
      />

      <div className="hov-divider" />

      <div className="hov-kv-list">
        <div className="hov-kv-row">
          <span className="hov-kv-label">ArcaneOS</span>
          <div className="hov-kv-value-stack">
            <span className="hov-kv-value">
              {arcane_os.percentage ? arcane_os.percentage.toFixed(1) : '0.0'}%
            </span>
            {arcane_os.total_nodes > 0 && (
              <span className="hov-res-numbers">
                {fmtCompact(arcane_os.arcane_nodes)} / {fmtCompact(arcane_os.total_nodes)} nodes
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Panel 3: App Ecosystem ─────────────────────────────────────────────────────

function AppEcosystemPanel({ gstore, appSpecs }) {
  const { runningCategoryMap, node_count } = gstore;
  const hasRunning = Object.keys(runningCategoryMap).length > 0;

  // Still loading if no node data at all
  if (!hasRunning && node_count.total === 0) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--ecosystem">
        <Spinner size={24} />
      </div>
    );
  }

  // Prefer live running-app data; fall back to spec-based if fetch failed
  let allCats;
  if (hasRunning) {
    allCats = Object.entries(runningCategoryMap)
      .map(([category, totalInstances]) => ({ category, totalInstances }))
      .sort((a, b) => b.totalInstances - a.totalInstances);
  } else if (appSpecs) {
    allCats = appSpecs.networkCategories || [];
  } else {
    return (
      <div className="hov-panel hov-panel-center hov-panel--ecosystem">
        <Spinner size={24} />
      </div>
    );
  }

  const cats = allCats.slice(0, 12);
  const grandTotal = allCats.reduce((s, c) => s + c.totalInstances, 0) || 1;
  const maxVal = cats[0]?.totalInstances || 1;

  return (
    <div className="hov-panel hov-panel--ecosystem">
      <PanelHeader title="APP ECOSYSTEM" badge={grandTotal} />

      <div className="hov-eco-list">
        {cats.map(({ category, totalInstances }) => {
          const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
          const { label, Icon, color } = meta;
          const barPct = (totalInstances / maxVal) * 100;
          const sharePct = ((totalInstances / grandTotal) * 100).toFixed(0);
          const tooltip = CATEGORY_TOOLTIPS[category] || category;

          return (
            <div key={category} className="hov-eco-row">
              <span className="hov-eco-icon" style={{ color }}>
                <Icon size={11} />
              </span>
              <Tooltip2
                content={tooltip}
                placement="top"
                hoverOpenDelay={250}
                transitionDuration={80}
                popoverClassName="hov-cat-tooltip"
              >
                <span className="hov-eco-label">{label}</span>
              </Tooltip2>
              <div className="hov-eco-bar-wrap">
                <div className="hov-eco-bar-fill" style={{ width: `${barPct}%`, background: color }} />
              </div>
              <span className="hov-eco-count">{fmtNum(totalInstances)}</span>
              <span className="hov-eco-pct">{sharePct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Panel 4: Top Hosted Apps ──────────────────────────────────────────────────

function TopHostedAppsPanel({ gstore }) {
  const images = gstore.topRunningImages || [];
  const isLoading = images.length === 0 && gstore.node_count.total > 0;
  const maxCount = images[0]?.nodeCount || 1;

  return (
    <div className="hov-panel hov-panel--top-apps">
      <PanelHeader title="TOP HOSTED APPS" />
      <div className="hov-ranked-list">
        {isLoading ? (
          <div className="hov-panel-center"><Spinner size={20} /></div>
        ) : images.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          images.map(({ image, nodeCount }, i) => (
            <div key={image} className="hov-ranked-row">
              <span className="hov-rank">#{i + 1}</span>
              <span className="hov-ranked-name">{shortImageName(image)}</span>
              <div className="hov-ranked-bar-wrap">
                <div
                  className="hov-ranked-bar-fill"
                  style={{ width: `${(nodeCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Panel 5: Apps Expiring Today ──────────────────────────────────────────────

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
      <PanelHeader title="EXPIRING TODAY" badge={items.length || null} />
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None expiring today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <span className="hov-badge hov-badge--warn">{spec.instances}×</span>
              <span className="hov-spec-val">{spec.totalCpu.toFixed(2)}c</span>
              <span className="hov-spec-val">{spec.totalRamGB.toFixed(2)}GB</span>
              <span className="hov-spec-val">{(spec.totalSsdGB || 0).toFixed(2)}GB</span>
              <span className="hov-time hov-time--warn">in {blocksToHuman(spec.expiresInBlocks)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Panel 6: Deployed Today ───────────────────────────────────────────────────

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
      <PanelHeader title="DEPLOYED TODAY" badge={items.length || null} />
      <div className="hov-list">
        {items.length === 0 ? (
          <div className="hov-empty">None deployed today</div>
        ) : (
          items.map((spec, i) => (
            <div key={spec.name + i} className="hov-spec-row">
              <span className="hov-list-name">{spec.name}</span>
              <span className="hov-badge hov-badge--green">{spec.instances}×</span>
              <span className="hov-spec-val">{spec.totalCpu.toFixed(2)}c</span>
              <span className="hov-spec-val">{spec.totalRamGB.toFixed(2)}GB</span>
              <span className="hov-spec-val">{(spec.totalSsdGB || 0).toFixed(2)}GB</span>
              <span className="hov-time hov-time--green">{blocksToHuman(spec.deployedAgeBlocks)} ago</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Panel 7: Node Geolocation ─────────────────────────────────────────────────

function GeoDistributionPanel({ gstore, countryCounts }) {
  if (!countryCounts || countryCounts.length === 0) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--geo">
        <Spinner size={20} />
      </div>
    );
  }

  const networkTotal = gstore.node_count.total;
  const geoTotal = countryCounts.reduce((s, c) => s + c.nodeCount, 0);
  const unknownCount = Math.max(0, networkTotal - geoTotal);
  const top = countryCounts.slice(0, 40);

  return (
    <div className="hov-panel hov-panel--geo">
      <PanelHeader title="NODE DISTRIBUTION" badge={countryCounts.length} />
      <div className="hov-geo-subtitle">
        {fmtNum(networkTotal)} nodes across {countryCounts.length} countries
        {unknownCount > 0 && ` (+${fmtNum(unknownCount)} unlocated)`}
      </div>
      <div className="hov-geo-grid">
        {top.map(({ countryCode, country, nodeCount }) => (
          <div key={countryCode} className="hov-geo-chip" title={`${country}: ${nodeCount} nodes`}>
            <ReactCountryFlag
              countryCode={countryCode}
              svg
              style={{ width: '1.3em', height: '1.3em', borderRadius: '2px' }}
            />
            <span className="hov-geo-count">{fmtCompact(nodeCount)}</span>
          </div>
        ))}
        {unknownCount > 0 && (
          <div className="hov-geo-chip hov-geo-chip--unknown" title={`${fmtNum(unknownCount)} nodes without geolocation data`}>
            <span className="hov-geo-unknown-icon">?</span>
            <span className="hov-geo-count">{fmtCompact(unknownCount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Top Dogs Panel ─────────────────────────────────────────────────────────────

const TIER_CONFIG = {
  CUMULUS: { label: 'Cumulus', color: '#2686d0' },
  NIMBUS:  { label: 'Nimbus',  color: '#d07e26' },
  STRATUS: { label: 'Stratus', color: '#c92641' },
};

const METRIC_CONFIG = [
  { key: 'eps',        label: 'EPS',  Icon: FiCpu,       format: (v) => fmtNum(v, 0) },
  { key: 'dws',        label: 'DWS',  Icon: FiHardDrive, format: (v) => fmtNum(v, 0) },
  { key: 'down_speed', label: 'Down', Icon: FiDownload,  format: (v) => v != null ? v.toFixed(1) + ' Mb/s' : '—' },
  { key: 'up_speed',   label: 'Up',   Icon: FiUpload,    format: (v) => v != null ? v.toFixed(1) + ' Mb/s' : '—' },
];

const TIERS_ORDER = ['CUMULUS', 'NIMBUS', 'STRATUS'];

function MetricCard({ metric, winner, nodeGeoMap }) {
  const { label, Icon, format } = metric;
  if (!winner) return (
    <div className="td-metric-card td-metric-card--empty">
      <div className="td-metric-header"><Icon size={11} /><span className="td-metric-label">{label}</span></div>
      <span className="td-metric-ip">—</span>
      <div className="td-metric-footer"><span className="td-metric-score">—</span></div>
    </div>
  );
  const { ip, value } = winner;
  const geo = nodeGeoMap?.[ip];
  return (
    <div className="td-metric-card">
      <div className="td-metric-header"><Icon size={11} className="td-metric-icon" /><span className="td-metric-label">{label}</span></div>
      <span className="td-metric-ip" title={ip}>{ip}</span>
      <div className="td-metric-footer">
        <span className="td-metric-score">{format(value)}</span>
        {geo?.countryCode && (
          <ReactCountryFlag
            countryCode={geo.countryCode}
            svg
            title={geo.country}
            style={{ width: '1.1em', height: '1.1em', borderRadius: '2px', flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  );
}

function TierRow({ tier, tierRankings, nodeGeoMap }) {
  const { label, color } = TIER_CONFIG[tier];
  const rankings = tierRankings?.[tier];
  return (
    <div className="td-tier-row" style={{ borderLeftColor: color }}>
      <div className="td-tier-label-col">
        <span className="td-tier-dot" style={{ background: color }} />
        <span className="td-tier-name" style={{ color }}>{label}</span>
      </div>
      <div className="td-metric-cards">
        {METRIC_CONFIG.map((m) => (
          <MetricCard key={m.key} metric={m} winner={rankings?.[m.key]?.[0] ?? null} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}

function TopDogsPanel({ globalRankings }) {
  if (!globalRankings) return (
    <div className="hov-panel hov-panel-center hov-panel--top-dogs">
      <Spinner size={20} />
    </div>
  );
  const { tierRankings, nodeGeoMap } = globalRankings;
  return (
    <div className="hov-panel hov-panel--top-dogs">
      <PanelHeader title="TOP DOGS" right={<FaTrophy size={14} className="td-header-icon" />} />
      <div className="td-body">
        {TIERS_ORDER.map((tier) => (
          <TierRow key={tier} tier={tier} tierRankings={tierRankings} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function HomeOverview({ gstore, appSpecs, countryCounts, globalRankings }) {
  return (
    <div className="home-overview">
      <div className="home-overview-row">
        <NetworkStatsPanel gstore={gstore} />
        <NetworkResourcesPanel gstore={gstore} />
        <AppEcosystemPanel gstore={gstore} appSpecs={appSpecs} />
      </div>
      <div className="home-overview-row home-overview-row--bottom">
        <TopHostedAppsPanel gstore={gstore} />
        <ExpiringTodayPanel appSpecs={appSpecs} />
        <DeployedTodayPanel appSpecs={appSpecs} />
      </div>
      <TopDogsPanel globalRankings={globalRankings} />
      <GeoDistributionPanel gstore={gstore} countryCounts={countryCounts} />
    </div>
  );
}
