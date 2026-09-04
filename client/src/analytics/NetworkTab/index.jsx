import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_node_geolocation } from 'networkNodes';
import { rollupByContinent } from 'analytics/continentDistribution';
import { WorldMap } from 'analytics/WorldMap';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

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
      <WorldMap countryCounts={countryCounts} />
      <div className="network-tab-continent-row">
        <ContinentBreakdown continents={continentData.continents} networkTotal={continentData.networkTotal} />
      </div>
    </div>
  );
}
