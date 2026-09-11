import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { FiCpu, FiHardDrive, FiDownload, FiUpload } from 'react-icons/fi';
import { FaTrophy } from 'react-icons/fa';
import ReactCountryFlag from 'react-country-flag';
import {
  fetch_node_geolocation,
  fetch_node_benchmarks,
  fetch_node_running_apps,
  fetch_flux_nodes
} from 'networkNodes';
import { aggregateRegions, selectRegionStats, countriesIn } from 'analytics/regionStats';
import { appNameFromContainer } from 'fluxinfo';
import { fetch_global_app_specs_raw } from 'apidata';
import { buildSpecIndex } from 'appSpecs';
import { isOpaqueRuntimeImage } from 'main/Gamification/appCategories';
import { TotalNetworkCard, NetworkResourcesCard, HostedApplicationsCard } from './regionCards';
import { fetch_global_performance_rankings } from 'apidata';
import { rollupByContinent } from 'analytics/continentDistribution';
import { WorldMap } from 'analytics/WorldMap';
import { PanelGate } from 'analytics/PanelGate';
import './index.scss';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
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

/*
 * Region selector. Continent first, then the countries within it (issue #254).
 *
 * Sits ABOVE the map because it drives the map -- the continent list used to be
 * a read-only panel underneath, which read as a summary rather than a control.
 */
function ScopeSelector({ agg, scope, onChange }) {
  const continents = Object.entries(agg?.continents || {})
    .filter(([name]) => name !== 'Unlocated')
    .sort((a, b) => b[1].nodes - a[1].nodes)
    .map(([name, b]) => ({ name, nodes: b.nodes }));

  const countries = scope.continent ? countriesIn(agg, scope.continent) : [];

  return (
    <div className="nt-scope">
      <div className="nt-scope-group">
        <span className="nt-scope-label">Continent</span>
        <div className="nt-chips">
          <button
            type="button"
            className={`nt-chip${scope.level === 'network' ? ' nt-chip--active' : ''}`}
            onClick={() => onChange({ level: 'network' })}
          >
            Whole network
          </button>
          {continents.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`nt-chip${scope.continent === c.name ? ' nt-chip--active' : ''}`}
              onClick={() => onChange({ level: 'continent', continent: c.name })}
            >
              {c.name}
              <span className="nt-chip-count">{c.nodes.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Only once a continent narrows it to a usable list -- 57 countries at
          once is a wall, not a control. */}
      {scope.continent && countries.length > 0 && (
        <div className="nt-scope-group">
          <span className="nt-scope-label">Country</span>
          <div className="nt-chips">
            <button
              type="button"
              className={`nt-chip${scope.level === 'continent' ? ' nt-chip--active' : ''}`}
              onClick={() => onChange({ level: 'continent', continent: scope.continent })}
            >
              All of {scope.continent}
            </button>
            {countries.map((c) => (
              <button
                key={c.countryCode}
                type="button"
                className={`nt-chip${scope.country === c.countryCode ? ' nt-chip--active' : ''}`}
                onClick={() => onChange({ level: 'country', continent: scope.continent, country: c.countryCode })}
              >
                {c.country}
                <span className="nt-chip-count">{c.nodes.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NetworkTab() {
  const [countryCounts, setCountryCounts] = useState([]);
  const [continentData, setContinentData] = useState({ continents: [], networkTotal: 0 });
  const [globalRankings, setGlobalRankings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState(null);
  const [scope, setScope] = useState({ level: 'network' });

  useEffect(() => {
    let cancelled = false;

    // World Map / Continent Breakdown only ever needed geolocation data, so
    // this fetch controls `loading` on its own rather than waiting on the
    // much larger performance-rankings payload below (~3.45MB) via
    // Promise.all — TopDogsPanel already has its own null-check spinner.
    (async () => {
      const geoEntries = await fetch_node_geolocation();
      if (cancelled) return;
      setCountryCounts(countByCountry(geoEntries));
      setContinentData(rollupByContinent(geoEntries));
      setLoading(false);
    })().catch(() => {
      // fetch_node_geolocation() already swallows its own errors and
      // resolves to [] (networkNodes.js's _shared() wrapper), so this is
      // defensive only — but it turns "hangs on a spinner forever" into
      // "renders the empty state" if that contract ever changes.
      if (!cancelled) setLoading(false);
    });

    (async () => {
      const rankings = await fetch_global_performance_rankings();
      if (cancelled) return;
      setGlobalRankings(rankings);
    })().catch(() => {});

    /*
     * Region aggregation (#254). Every feed here is shared via networkNodes.js,
     * so the 4 MB node list and the 3.45 MB benchmark projection are each
     * fetched once for this page even though rankings above wants them too.
     */
    (async () => {
      const [nodes, geoEntries, benchmarks, runningApps, rawSpecs] = await Promise.all([
        fetch_flux_nodes(),
        fetch_node_geolocation(),
        fetch_node_benchmarks(),
        fetch_node_running_apps(),
        // Cached for 5 minutes in sessionStorage and already warm from the Apps
        // tab; needed so these categories match the ones shown there.
        fetch_global_app_specs_raw()
      ]);
      if (cancelled) return;

      const geoByHost = {};
      for (const entry of geoEntries || []) {
        const geo = entry?.geolocation;
        if (geo?.ip) geoByHost[(geo.ip || '').split(':')[0]] = geo;
      }

      // Keyed on the exact ip:port: capacity is per NODE, and one machine can
      // run several nodes with very different hardware allocations.
      const capByNode = {};
      for (const entry of benchmarks || []) {
        const bench = entry?.benchmark?.bench;
        if (bench?.ipaddress) {
          capByNode[bench.ipaddress] = { cores: bench.cores, ram: bench.ram, ssd: bench.ssd };
        }
      }

      const appsByNode = {};
      for (const entry of runningApps || []) {
        const running = entry?.apps?.runningapps;
        if (!entry?.ip || !Array.isArray(running)) continue;
        appsByNode[entry.ip] = running
          .map((a) => appNameFromContainer((a?.Names || [])[0]))
          .filter(Boolean);
      }

      /*
       * The SAME categorisation the Apps tab uses: join the running app's name
       * to its globalappsspecifications entry and read spec.category. A keyword
       * match on the name instead puts ~61% of instances in "other", and two
       * different breakdowns of the same apps on one page is worse than none.
       *
       * The isOpaqueRuntimeImage guard mirrors runningAppsCategorized.js:
       * runonflux/orbit is a git-deployment wrapper, so its real workload is
       * unknowable and categorising it by the operator's deployment name would
       * be misleading.
       */
      const specIndex = buildSpecIndex(rawSpecs || []);
      const categoryOf = (appName) => {
        const spec = specIndex[appName];
        return isOpaqueRuntimeImage(spec?.repotag) ? 'other' : spec?.category || 'other';
      };

      setAgg(aggregateRegions({ nodes, geoByHost, capByNode, appsByNode, categoryOf }));
    })().catch(() => {});

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="network-tab hov-panel-center">
        <Spinner size={30} />
      </div>
    );
  }

  const totalNodes = globalRankings
    ? (globalRankings.officialNodeCounts?.CUMULUS || 0)
      + (globalRankings.officialNodeCounts?.NIMBUS || 0)
      + (globalRankings.officialNodeCounts?.STRATUS || 0)
    : null;

  const stats = selectRegionStats(agg, scope);
  const scopeLabel =
    scope.level === 'country'
      ? agg?.countries?.[scope.country]?.country || scope.country
      : scope.level === 'continent'
        ? scope.continent
        : 'Whole network';

  return (
    <div className="network-tab">
      <div className="network-tab-hero">
        <span className="network-tab-hero-value">{totalNodes != null ? fmtNum(totalNodes) : '—'}</span>
        <span className="network-tab-hero-label">Total nodes</span>
      </div>

      {agg && <ScopeSelector agg={agg} scope={scope} onChange={setScope} />}

      {/*
        * Map and cards side by side. The map used to be full width and very
        * tall; at a third of the page it still reads while leaving room for the
        * figures it is now a control for (#254).
        */}
      <div className="network-tab-explorer">
        <PanelGate panelKey="worldMap" feature="World Map" preview="blur">
          <WorldMap
            countryCounts={countryCounts}
            scope={scope}
            selectedCountry={scope.level === 'country' ? scope.country : null}
            onSelectCountry={
              agg
                ? (code) => {
                    const c = agg.countries?.[code];
                    if (c) setScope({ level: 'country', continent: c.continent, country: code });
                  }
                : undefined
            }
          />
        </PanelGate>

        <div className="network-tab-cards">
          {stats ? (
            <>
              <TotalNetworkCard stats={stats} label={scopeLabel} />
              <NetworkResourcesCard stats={stats} label={scopeLabel} />
              <HostedApplicationsCard stats={stats} label={scopeLabel} />
            </>
          ) : (
            <div className="hov-panel hov-panel-center nt-card">
              <Spinner size={20} />
            </div>
          )}
        </div>
      </div>

      <div className="network-tab-continent-row">
        <PanelGate panelKey="continentBreakdown" feature="Continent Breakdown" preview="blur">
          <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
        </PanelGate>
      </div>
      <PanelGate panelKey="topDogs" feature="Top Dogs">
        <TopDogsPanel globalRankings={globalRankings} />
      </PanelGate>
    </div>
  );
}
