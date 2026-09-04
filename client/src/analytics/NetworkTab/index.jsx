import { useEffect, useState } from 'react';
import { Spinner } from '@blueprintjs/core';
import { fetch_country_node_counts } from 'apidata';
import { fetch_continent_distribution } from 'analytics/continentDistribution';
import { WorldMap } from 'analytics/WorldMap';
import './index.scss';

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

function pct(n, total) {
  return total > 0 ? ((n / total) * 100).toFixed(0) : '0';
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
      // Both ultimately read the same shared, deduped geolocation fetch
      // (networkNodes.js's fetch_node_geolocation, see continentDistribution.js) —
      // calling them together costs one real network request, not two.
      const [counts, continentResult] = await Promise.all([
        fetch_country_node_counts(),
        fetch_continent_distribution(),
      ]);
      if (cancelled) return;

      setCountryCounts(counts);
      setContinentData(continentResult);
      setLoading(false);
    })();

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
