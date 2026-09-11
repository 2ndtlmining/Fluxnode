import React from 'react';
import './index.scss';

import { Tooltip2 } from '@blueprintjs/popover2';
import { getCountryCentroid, projectToPercent } from 'geo/countryCentroids';
import { WORLD_LAND_PATH } from 'geo/worldLandPath';
import { boundsFor, viewBoxFor, remapToBounds, WORLD_BOUNDS } from 'geo/regionBounds';

const MIN_RADIUS_PX = 3;
const MAX_RADIUS_PX = 11;

/*
 * Graticule: decorative lat/lon reference lines, not survey-accurate.
 *
 * Deliberately SPARSER than before (30°/60° rather than 20°/30°). The dense
 * grid existed to compensate for having no coastlines -- WorldMap's previous
 * comment called that out as a legibility gap. Now that real landmasses carry
 * the spatial reference, a dense grid competes with them instead of helping,
 * so this is back to a light equator/tropic-ish scaffold.
 */
const GRATICULE_LATS = [-60, -30, 0, 30, 60];
const GRATICULE_LONS = [-120, -60, 0, 60, 120];

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

export function WorldMap({ countryCounts, scope, selectedCountry, onSelectCountry }) {
  const counts = countryCounts || [];
  const bounds = boundsFor(scope) || WORLD_BOUNDS;
  const viewBox = viewBoxFor(bounds);
  const maxCount = counts[0]?.nodeCount || 1;

  // Countries with no known centroid are left off the map rather than
  // plotted at DEFAULT_CENTROID — several unrelated countries stacked on
  // one fallback point would read as a real cluster. getCountryCentroid
  // already returns null for anything outside COUNTRY_CENTROIDS. The gap
  // is surfaced below (unmappedCount) rather than silently dropped.
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

  const unmappedCount = counts.length - bubbles.length;

  return (
    <div className="hov-panel wm-panel">
      <div className="hov-header">
        <span className="hov-header-title">NODE DISTRIBUTION MAP</span>
        {bubbles.length > 0 && <span className="hov-header-badge">{bubbles.length}</span>}
      </div>

      {counts.length === 0 ? (
        <div className="hov-empty">No data available</div>
      ) : (
        <>
          <div className="wm-frame">
            {/*
              * Equirectangular landmass, drawn first so everything else sits
              * on top of it. viewBox 0 0 360 180 with preserveAspectRatio
              * "none" means the SVG's coordinate space IS lon+180 / 90-lat --
              * identical to projectToPercent, which is what positions the
              * bubbles. They therefore align by construction rather than by
              * tuning, and stay aligned at any container size or aspect ratio.
              */}
            <svg
              className="wm-land"
              viewBox={viewBox}
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <path d={WORLD_LAND_PATH} />
            </svg>

            {GRATICULE_LATS.map((lat) => (
              <div
                key={`lat-${lat}`}
                className="wm-graticule wm-graticule--h"
                style={{ top: `${remapToBounds(projectToPercent([lat, 0]), bounds).yPct}%` }}
              />
            ))}
            {GRATICULE_LONS.map((lon) => (
              <div
                key={`lon-${lon}`}
                className="wm-graticule wm-graticule--v"
                style={{ left: `${remapToBounds(projectToPercent([0, lon]), bounds).xPct}%` }}
              />
            ))}

            {bubbles.map((b) => {
              /*
               * Bubbles are HTML in percent, the landmass is SVG -- both are
               * remapped through the SAME bounds so a zoom cannot drift one off
               * the other (#254).
               */
              const { xPct, yPct } = remapToBounds({ xPct: b.xPct, yPct: b.yPct }, bounds);
              // Outside the current view. Hidden rather than clamped: pinned to
              // an edge it would read as a real node in the wrong country.
              if (xPct < -2 || xPct > 102 || yPct < -2 || yPct > 102) return null;

              const isSelected = selectedCountry && b.countryCode === selectedCountry;
              return (
                <Tooltip2
                  key={b.countryCode}
                  content={`${b.country}: ${fmtNum(b.nodeCount)} nodes`}
                  placement="top"
                  hoverOpenDelay={150}
                  transitionDuration={80}
                >
                  <div
                    className={`wm-bubble${isSelected ? ' wm-bubble--selected' : ''}${onSelectCountry ? ' wm-bubble--clickable' : ''}`}
                    role={onSelectCountry ? 'button' : undefined}
                    tabIndex={onSelectCountry ? 0 : undefined}
                    aria-label={onSelectCountry ? `Show ${b.country}` : undefined}
                    onClick={onSelectCountry ? () => onSelectCountry(b.countryCode) : undefined}
                    onKeyDown={
                      onSelectCountry
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelectCountry(b.countryCode);
                            }
                          }
                        : undefined
                    }
                    title={`${b.country}: ${fmtNum(b.nodeCount)} nodes`}
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      width: `${b.radiusPx * 2}px`,
                      height: `${b.radiusPx * 2}px`,
                    }}
                  />
                </Tooltip2>
              );
            })}
          </div>
          {unmappedCount > 0 && (
            <div className="wm-caption">
              +{unmappedCount} {unmappedCount === 1 ? 'country' : 'countries'} not shown (no map coordinates)
            </div>
          )}
        </>
      )}
    </div>
  );
}
