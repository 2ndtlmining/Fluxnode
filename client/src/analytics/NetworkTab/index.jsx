import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { FiCpu, FiHardDrive, FiDownload, FiUpload } from 'react-icons/fi';
import { FaTrophy } from 'react-icons/fa';
import ReactCountryFlag from 'react-country-flag';
import { fetch_node_geolocation } from 'networkNodes';
import { fetch_global_performance_rankings } from 'apidata';
import { rollupByContinent } from 'analytics/continentDistribution';
import { WorldMap } from 'analytics/WorldMap';
import { PanelGate } from 'analytics/PanelGate';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
}

/*
 * Same raw geolocation array rollupByContinent consumes, grouped by country
 * instead of continent. Deriving both panels from one fetch_node_geolocation()
 * call — rather than WorldMap reading apidata.js's fetch_country_node_counts,
 * which can serve a cached, benchmark-derived count on one of its paths
 * (apidata.js:1407-1428) — keeps the map and the continent panel unable to
 * silently disagree with each other. Flagged in the final branch review.
 */
function countByCountry(geoEntries) {
  const perCountry = {};
  for (const entry of geoEntries || []) {
    const geo = entry?.geolocation;
    const cc = geo?.countryCode || geo?.country_code;
    if (!cc) continue;
    if (!perCountry[cc]) perCountry[cc] = { country: geo.country || cc, countryCode: cc, nodeCount: 0 };
    perCountry[cc].nodeCount++;
  }
  return Object.values(perCountry).sort((a, b) => b.nodeCount - a.nodeCount);
}

// ── Top Dogs Panel ─────────────────────────────────────────────────────────────
// Moved verbatim from home/HomeOverview/index.jsx (Session 2 IA migration) —
// no markup/logic changes, just relocated next to the network's other
// performance-ranking content.

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

function TierRow({ tier, tierWinners, nodeGeoMap }) {
  const { label, color } = TIER_CONFIG[tier];
  const winners = tierWinners?.[tier];
  return (
    <div className="td-tier-row" style={{ borderLeftColor: color }}>
      <div className="td-tier-label-col">
        <span className="td-tier-dot" style={{ background: color }} />
        <span className="td-tier-name" style={{ color }}>{label}</span>
      </div>
      <div className="td-metric-cards">
        {METRIC_CONFIG.map((m) => (
          <MetricCard key={m.key} metric={m} winner={winners?.[m.key] ?? null} nodeGeoMap={nodeGeoMap} />
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
  const { tierWinners, nodeGeoMap } = globalRankings;
  return (
    <div className="hov-panel hov-panel--top-dogs">
      <div className="hov-header">
        <span className="hov-header-title">TOP DOGS</span>
        <FaTrophy size={14} className="td-header-icon" />
      </div>
      <div className="td-body">
        {TIERS_ORDER.map((tier) => (
          <TierRow key={tier} tier={tier} tierWinners={tierWinners} nodeGeoMap={nodeGeoMap} />
        ))}
      </div>
    </div>
  );
}

function ContinentBreakdown({ continents, networkTotal }) {
  const rows = continents || [];
  const maxVal = rows[0]?.nodeCount || 1;

  return (
    <div className="hov-panel nt-continent-panel">
      <div className="hov-header">
        <span className="hov-header-title">CONTINENT DISTRIBUTION</span>
        <span className="hov-header-badge">{rows.length}</span>
      </div>
      {rows.length > 0 && (
        <div className="nt-continent-subtitle">
          {fmtNum(networkTotal)} geolocated nodes across {rows.length} continent{rows.length === 1 ? '' : 's'}
        </div>
      )}
      <div className="hov-ranked-list">
        {rows.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          rows.map(({ continent, nodeCount }, i) => (
            <div key={continent} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name">{continent}</span>
              <div className="hov-ranked-bar-wrap">
                <div className="hov-ranked-bar-fill" style={{ width: `${(nodeCount / maxVal) * 100}%` }} />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)} ({pct(nodeCount, networkTotal)}%)</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function NetworkTab() {
  const [countryCounts, setCountryCounts] = useState([]);
  const [continentData, setContinentData] = useState({ continents: [], networkTotal: 0 });
  const [globalRankings, setGlobalRankings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [geoEntries, rankings] = await Promise.all([
        fetch_node_geolocation(),
        fetch_global_performance_rankings(),
      ]);
      if (cancelled) return;

      setCountryCounts(countByCountry(geoEntries));
      setContinentData(rollupByContinent(geoEntries));
      setGlobalRankings(rankings);
      setLoading(false);
    })().catch(() => {
      // fetch_node_geolocation() already swallows its own errors and
      // resolves to [] (networkNodes.js's _shared() wrapper), so this is
      // defensive only — but it turns "hangs on a spinner forever" into
      // "renders the empty state" if that contract ever changes.
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="network-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="network-tab">
      <PanelGate panelKey="worldMap" feature="World Map">
        <WorldMap countryCounts={countryCounts} />
      </PanelGate>
      <div className="network-tab-continent-row">
        <PanelGate panelKey="continentBreakdown" feature="Continent Breakdown">
          <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
        </PanelGate>
      </div>
      <PanelGate panelKey="topDogs" feature="Top Dogs">
        <TopDogsPanel globalRankings={globalRankings} />
      </PanelGate>
    </div>
  );
}
