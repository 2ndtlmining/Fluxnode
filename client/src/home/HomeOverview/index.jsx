import React, { useState, useEffect } from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { LuBrainCircuit } from 'react-icons/lu';
import { Gpu } from 'lucide-react';
import ReactCountryFlag from 'react-country-flag';
// The project's own wrapper, which honours REACT_APP_ENABLE_NUMBER_SPINNING.
// HomeOverview was the only file importing react-countup directly, so the home
// page animated while the rest of the app did not.
import CountUp from 'components/CountUp';

import { CC_COLLATERAL_CUMULUS, CC_COLLATERAL_NIMBUS, CC_COLLATERAL_STRATUS } from 'content';
import { AppEcosystemBreakdown } from 'components/AppEcosystemBreakdown';
import { TopHostedApps } from 'components/TopHostedApps';
import { fluxos_version_string, daemon_version_string } from 'main/flux_version';

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

// ── Shared sub-components ──────────────────────────────────────────────────────

function PanelHeader({ title, badge, badgeClassName, badgeContent, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {right}
      {badgeContent ?? (badge != null && (
        <span className={`hov-header-badge${badgeClassName ? ' ' + badgeClassName : ''}`}>
          {fmtNum(badge)}
        </span>
      ))}
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
        className={`hov-demand-dot${!level.border ? ' hov-demand-dot--pulse' : ''}`}
        style={{
          background: level.color,
          color: level.color,
          ...(level.border ? { outline: '1.5px solid #9ca3af' } : {}),
        }}
      />
    </Tooltip2>
  );
}

function ThinBar({ pct, color }) {
  const [mounted, setMounted] = useState(false);
  const clamped = Math.min(100, Math.max(0, pct || 0));

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="hov-thin-bar-track">
      <div className="hov-thin-bar-fill" style={{ width: `${mounted ? clamped : 0}%`, background: color }} />
    </div>
  );
}

// ── Panel 1: Flux Network Stats ───────────────────────────────────────────────

function NetworkStatsPanel({ gstore, gpuPrices }) {
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
      <PanelHeader
        title="FLUX NETWORK"
        badgeContent={
          total > 0 ? (
            <span className="hov-header-badge hov-header-badge--hero">
              <CountUp end={total} />
            </span>
          ) : null
        }
      />

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
          <span className="hov-kv-value hov-green" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {gstore.flux_price_usd > 0
              ? <CountUp end={gstore.flux_price_usd} decimals={4} prefix="$" />
              : '—'}
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
        <div className="hov-kv-row">
          <Tooltip2
            content="Version reported by the Flux daemon. Compare against your own node to spot an out-of-date fluxd."
            placement="top"
            hoverOpenDelay={250}
            transitionDuration={80}
            popoverClassName="hov-cat-tooltip"
          >
            <span className="hov-kv-label">Daemon Version</span>
          </Tooltip2>
          <span className="hov-kv-value">{daemon_version_string(gstore.daemon_version) ?? '—'}</span>
        </div>
        {gpuPrices && (
          <>
            <div className="hov-kv-row">
              <span className="hov-kv-label">Flux Edge GPUs</span>
              <span className="hov-kv-value hov-green">{fmtNum(gpuPrices.totalGPUs)}</span>
            </div>
            <div className="hov-kv-row">
              <span className="hov-kv-label">FluxAI Machines</span>
              <span className="hov-kv-value">{fmtNum(gpuPrices.totalComputers)}</span>
            </div>
          </>
        )}
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
              style={{ width: '1.8em', height: '1.8em', borderRadius: '2px' }}
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

// ── FluxAI GPU Panel ──────────────────────────────────────────────────────────

// Content decision, not a user preference: the panel duplicates numbers already
// shown in NetworkStatsPanel and reads as a low-value bolt-on table. Flip this
// back to true to re-enable it — the component, its data fetch, and its CSS are
// left fully intact.
const SHOW_FLUX_AI_PANEL = false;

function FluxAIPanel({ gpuPrices }) {
  const [sortKey, setSortKey] = useState('number_of_gpus');
  const [sortDir, setSortDir] = useState('desc');

  if (gpuPrices === null) return null;

  const models = gpuPrices.models || [];

  if (models.length === 0) {
    return (
      <div className="hov-panel hov-panel--fluxai">
        <PanelHeader
          title="FLUX AI"
          right={<Gpu size={14} className="fluxai-header-icon" />}
        />
        <div className="hov-empty">No GPU data available</div>
      </div>
    );
  }

  const sorted = [...models].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    return sortDir === 'desc' ? bv - av : av - bv;
  });

  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const arrow = (key) => (sortKey === key ? (sortDir === 'desc' ? ' ▼' : ' ▲') : '');

  const columns = [
    { key: 'short_name',           label: 'GPU Model',  align: 'left',  sortable: false },
    { key: 'premium',              label: 'Tier',        align: 'center', sortable: false },
    { key: 'number_of_computers',  label: 'Machines',    align: 'right', sortable: true },
    { key: 'number_of_gpus',       label: 'GPUs',        align: 'right', sortable: true },
    { key: 'min_price',            label: 'Min',         align: 'right', sortable: true },
    { key: 'avg_price',            label: 'Avg',         align: 'right', sortable: true },
    { key: 'median_price',         label: 'Median',      align: 'right', sortable: true },
    { key: 'max_price',            label: 'Max',         align: 'right', sortable: true },
  ];

  return (
    <div className="hov-panel hov-panel--fluxai">
      <PanelHeader
        title="FLUX AI"
        right={<Gpu size={14} className="fluxai-header-icon" />}
        badge={models.length}
      />
      <div className="fluxai-table-wrap">
        <table className="fluxai-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? 'fluxai-th--sortable' : ''}
                  style={{ textAlign: col.align }}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  {col.label}{col.sortable ? arrow(col.key) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((gpu) => (
              <tr key={gpu.short_name}>
                <td className="fluxai-td--name">{gpu.short_name}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`fluxai-badge--${gpu.premium ? 'premium' : 'consumer'}`}>
                    {gpu.premium ? 'Premium' : 'Consumer'}
                  </span>
                </td>
                <td className="fluxai-td--num fluxai-td--machines">{fmtNum(gpu.number_of_computers)}</td>
                <td className="fluxai-td--num">{fmtNum(gpu.number_of_gpus)}</td>
                <td className="fluxai-td--num">${gpu.min_price?.toFixed(2) ?? '—'}</td>
                <td className="fluxai-td--num">${gpu.avg_price?.toFixed(2) ?? '—'}</td>
                <td className="fluxai-td--num">${gpu.median_price?.toFixed(2) ?? '—'}</td>
                <td className="fluxai-td--num">${gpu.max_price?.toFixed(2) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function HomeOverview({ gstore, countryCounts, gpuPrices }) {
  return (
    <div className="home-overview">
      <div className="home-overview-row">
        <NetworkStatsPanel gstore={gstore} gpuPrices={gpuPrices} />
        <NetworkResourcesPanel gstore={gstore} />
        <AppEcosystemBreakdown gstore={gstore} />
      </div>
      <TopHostedApps gstore={gstore} />
      {SHOW_FLUX_AI_PANEL && <FluxAIPanel gpuPrices={gpuPrices} />}
      <GeoDistributionPanel gstore={gstore} countryCounts={countryCounts} />
    </div>
  );
}
