import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { FiCpu, FiHardDrive, FiDownload, FiUpload } from 'react-icons/fi';
import { FaTrophy } from 'react-icons/fa';
import ReactCountryFlag from 'react-country-flag';
import {
  fetch_node_geolocation,
  fetch_node_benchmarks,
  fetch_node_running_apps,
  fetch_node_resources,
  fetch_flux_nodes
} from 'networkNodes';
import { aggregateRegions, selectRegionStats, countriesIn } from 'analytics/regionStats';
import { appNameFromContainer } from 'fluxinfo';
import { fetch_global_app_specs_raw } from 'apidata';
import { buildSpecIndex } from 'appSpecs';
import { isOpaqueRuntimeImage } from 'main/Gamification/appCategories';
import { TotalNetworkCard, NetworkResourcesCard, HostedApplicationsCard } from './regionCards';
import { fetch_global_performance_rankings, fetch_global_stats, fetch_gpu_prices } from 'apidata';
import { CC_COLLATERAL_CUMULUS, CC_COLLATERAL_NIMBUS, CC_COLLATERAL_STRATUS } from 'content';
import { fluxos_version_string, daemon_version_string } from 'main/flux_version';
import { WorldMap } from 'analytics/WorldMap';
import { PanelGate } from 'analytics/PanelGate';
import './index.scss';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/*
 * The raw geolocation array grouped by country, for the map.
 *
 * Deriving this from the same fetch_node_geolocation() call the rest of the tab
 * uses — rather than WorldMap reading apidata.js's fetch_country_node_counts,
 * which can serve a cached, benchmark-derived count on one of its paths
 * (apidata.js:1407-1428) — keeps the map unable to silently disagree with the
 * selector and the cards beside it. Flagged in the final branch review.
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

/*
 * Chain-wide facts, moved here from Home's FLUX NETWORK panel (issue #284).
 *
 * Placed ABOVE the scope selector on purpose, and that placement is the whole
 * idea: everything above the selector is network-wide, everything below it
 * answers to the selection. FLUX price, block height and daemon versions are
 * properties of the chain -- "FluxOS version in Germany" is not a question --
 * so putting them in the scoped card column would have been actively
 * misleading.
 *
 * Locked supply comes with them because it is derived from network-wide tier
 * counts and collateral, not from anything regional.
 *
 * The tier split that sat alongside these on Home is deliberately NOT carried
 * over: TotalNetworkCard already shows tier counts, and at "Whole network"
 * scope they are the same numbers.
 */
function NetworkStatusStrip({ gstore, gpuPrices }) {
  if (!gstore) return null;

  const { cumulus = 0, nimbus = 0, stratus = 0 } = gstore.node_count || {};
  const lockedSupply =
    cumulus * CC_COLLATERAL_CUMULUS + nimbus * CC_COLLATERAL_NIMBUS + stratus * CC_COLLATERAL_STRATUS;

  const stats = [
    {
      key: 'price',
      label: 'FLUX price',
      value: gstore.flux_price_usd > 0 ? `$${gstore.flux_price_usd.toFixed(4)}` : '—',
      accent: true
    },
    {
      key: 'height',
      label: 'Block height',
      value: gstore.current_block_height > 0 ? fmtNum(gstore.current_block_height) : '—'
    },
    {
      key: 'locked',
      label: 'Locked supply',
      value: lockedSupply > 0 ? `${(lockedSupply / 1e6).toFixed(1)}M FLUX` : '—'
    },
    {
      key: 'fluxos',
      label: 'FluxOS',
      value: gstore.fluxos_latest_version?.major > 0 ? fluxos_version_string(gstore.fluxos_latest_version) : '—'
    },
    {
      key: 'bench',
      label: 'Bench',
      value: gstore.bench_latest_version?.major > 0 ? fluxos_version_string(gstore.bench_latest_version) : '—'
    },
    {
      key: 'daemon',
      label: 'Daemon',
      value: daemon_version_string(gstore.daemon_version) ?? '—'
    }
  ];

  if (gpuPrices) {
    stats.push(
      { key: 'gpus', label: 'Flux Edge GPUs', value: fmtNum(gpuPrices.totalGPUs), accent: true },
      { key: 'machines', label: 'FluxAI machines', value: fmtNum(gpuPrices.totalComputers) }
    );
  }

  return (
    <div className="nt-status-strip">
      {stats.map((s) => (
        <div key={s.key} className="nt-status-item">
          <span className={`nt-status-value${s.accent ? ' nt-status-value--accent' : ''}`}>{s.value}</span>
          <span className="nt-status-label">{s.label}</span>
        </div>
      ))}
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
                {/*
                  #287. Only countries get a flag -- continents have none, so
                  the continent row above stays text-only rather than reserving
                  an empty slot to keep the two lists visually identical.
                  aria-hidden because the country name follows it immediately;
                  a screen reader announcing "Germany Germany" is worse than no
                  flag at all.
                */}
                <ReactCountryFlag
                  countryCode={c.countryCode}
                  svg
                  className="nt-chip-flag"
                  aria-hidden="true"
                />
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
  const [globalRankings, setGlobalRankings] = useState(null);
  const [gstore, setGstore] = useState(null);
  const [gpuPrices, setGpuPrices] = useState(null);
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
     * Chain-wide facts for the status strip (#284). Independent of the region
     * aggregation below and of each other, so each failing soft leaves the rest
     * of the tab intact -- NetworkStatusStrip renders nothing without gstore and
     * simply omits the GPU rows without gpuPrices, which is how Home behaved.
     *
     * Analytics renders only the active tab (renderActiveTabPanelOnly), so this
     * does not duplicate the Apps tab's own fetch_global_stats call.
     */
    (async () => {
      const store = await fetch_global_stats(null);
      if (cancelled) return;
      setGstore(store);
    })().catch(() => {});

    (async () => {
      const prices = await fetch_gpu_prices();
      if (cancelled) return;
      setGpuPrices(prices);
    })().catch(() => {});

    /*
     * Region aggregation (#254). Every feed here is shared via networkNodes.js,
     * so the 4 MB node list and the 3.45 MB benchmark projection are each
     * fetched once for this page even though rankings above wants them too.
     */
    (async () => {
      const [nodes, geoEntries, benchmarks, runningApps, resources, rawSpecs] = await Promise.all([
        fetch_flux_nodes(),
        fetch_node_geolocation(),
        fetch_node_benchmarks(),
        fetch_node_running_apps(),
        // Shared with the home page's resources panel, so this is usually
        // already in flight rather than a sixth request.
        fetch_node_resources(),
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

      /*
       * App-reserved utilisation, keyed on the same exact ip:port as capacity
       * (issue #287). Units are normalised to capacity's here so the card can
       * divide them directly: appsRamLocked arrives in MB against a benchmark
       * `ram` in GB, while appsHddLocked is already GB.
       */
      const utilByNode = {};
      for (const entry of resources || []) {
        const res = entry?.apps?.resources;
        if (entry?.ip && res) {
          utilByNode[entry.ip] = {
            cores: res.appsCpusLocked || 0,
            ram: res.appsRamLocked != null ? res.appsRamLocked / 1024 : 0,
            ssd: res.appsHddLocked || 0
          };
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

      setAgg(aggregateRegions({ nodes, geoByHost, capByNode, appsByNode, utilByNode, categoryOf }));
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

      <NetworkStatusStrip gstore={gstore} gpuPrices={gpuPrices} />

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

      <PanelGate panelKey="topDogs" feature="Top Dogs">
        <TopDogsPanel globalRankings={globalRankings} />
      </PanelGate>
    </div>
  );
}
