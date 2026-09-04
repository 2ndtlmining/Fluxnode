import React from 'react';
import './index.scss';

import { Tooltip2 } from '@blueprintjs/popover2';
import { getCountryCentroid, projectToPercent } from 'geo/countryCentroids';

const MIN_RADIUS_PX = 4;
const MAX_RADIUS_PX = 16;

// Graticule: decorative lat/lon reference lines, not survey-accurate — same
// spirit as countryCentroids.js's own centroids ("fine for a decorative
// ping, not for navigation").
const GRATICULE_LATS = [-60, -30, 0, 30, 60];
const GRATICULE_LONS = [-120, -60, 0, 60, 120];

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

export function WorldMap({ countryCounts }) {
  const counts = countryCounts || [];
  const maxCount = counts[0]?.nodeCount || 1;

  // Countries with no known centroid are left off the map rather than
  // plotted at DEFAULT_CENTROID — several unrelated countries stacked on
  // one fallback point would read as a real cluster. getCountryCentroid
  // already returns null for anything outside COUNTRY_CENTROIDS.
  const bubbles = counts
    .map((c) => {
      const centroid = getCountryCentroid(c.countryCode);
      if (!centroid) return null;
      const { xPct, yPct } = projectToPercent(centroid);
      const ratio = c.nodeCount / maxCount;
      // sqrt scale so bubble AREA (not radius) tracks node count — the
      // usual cartographic convention for proportional-symbol maps.
      const radiusPx = MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * Math.sqrt(ratio);
      return { ...c, xPct, yPct, radiusPx };
    })
    .filter(Boolean);

  return (
    <div className="hov-panel wm-panel">
      <div className="hov-header">
        <span className="hov-header-title">NODE DISTRIBUTION MAP</span>
      </div>

      {counts.length === 0 ? (
        <div className="hov-empty">No data available</div>
      ) : (
        <div className="wm-frame">
          {GRATICULE_LATS.map((lat) => (
            <div
              key={`lat-${lat}`}
              className="wm-graticule wm-graticule--h"
              style={{ top: `${projectToPercent([lat, 0]).yPct}%` }}
            />
          ))}
          {GRATICULE_LONS.map((lon) => (
            <div
              key={`lon-${lon}`}
              className="wm-graticule wm-graticule--v"
              style={{ left: `${projectToPercent([0, lon]).xPct}%` }}
            />
          ))}

          {bubbles.map((b) => (
            <Tooltip2
              key={b.countryCode}
              content={`${b.country}: ${fmtNum(b.nodeCount)} nodes`}
              placement="top"
              hoverOpenDelay={150}
              transitionDuration={80}
            >
              <div
                className="wm-bubble"
                style={{
                  left: `${b.xPct}%`,
                  top: `${b.yPct}%`,
                  width: `${b.radiusPx * 2}px`,
                  height: `${b.radiusPx * 2}px`,
                }}
              />
            </Tooltip2>
          ))}
        </div>
      )}
    </div>
  );
}
