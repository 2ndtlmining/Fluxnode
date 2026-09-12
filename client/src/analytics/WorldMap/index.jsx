import React from 'react';
import './index.scss';

import { ComposableMap, Geographies, Geography, Graticule, Marker, ZoomableGroup } from 'react-simple-maps';
import worldAtlas from 'world-atlas/countries-110m.json';
import { getCountryCentroid } from 'geo/countryCentroids';
import { boundsFor, mapFrameFor, WORLD_BOUNDS } from 'geo/regionBounds';

const MIN_RADIUS_PX = 3;
const MAX_RADIUS_PX = 11;

/*
 * The map's own coordinate space. Everything inside scales with the frame via
 * the SVG viewBox, so these are not screen pixels -- they set the aspect ratio
 * (2:1, matching .wm-frame) and the units bubble radii are expressed in.
 */
const MAP_WIDTH = 800;
const MAP_HEIGHT = 400;

/*
 * geoNaturalEarth1 rather than the equirectangular stretch this component drew
 * by hand (issue #290). Natural Earth is the projection atlases use for exactly
 * this job: it keeps continent shapes recognisable instead of smearing
 * high-latitude land sideways, which is what made Russia and Canada dominate
 * the old map.
 *
 * 150 frames the whole world in an 800x400 box; ZoomableGroup scales from there.
 */
const BASE_SCALE = 150;

function fmtNum(n) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString();
}

/*
 * The node distribution map (issues #254, #290).
 *
 * Previously a hand-drawn SVG path plus HTML bubbles positioned in percentages,
 * which required the landmass viewBox and the bubble coordinates to be remapped
 * through the same bounds box by hand to stay aligned. react-simple-maps
 * projects both through one projection instead, so alignment is the library's
 * problem rather than ours, and the geography is a real TopoJSON atlas rather
 * than 22.6 KB of hand-authored coastline.
 *
 * The atlas is IMPORTED, not fetched. That keeps the property the hand-rolled
 * version had and the reason it was written that way: this app runs on other
 * people's Flux nodes, and the map makes no third-party request at runtime.
 *
 * Everything the previous version did is preserved deliberately -- proportional
 * sqrt-area bubbles, click and keyboard selection, the selected ring, tooltips,
 * zoom-to-continent, and the unmapped-country disclosure.
 */
export function WorldMap({ countryCounts, scope, selectedCountry, onSelectCountry }) {
  const counts = countryCounts || [];
  const bounds = boundsFor(scope) || WORLD_BOUNDS;
  const { center, zoom } = mapFrameFor(bounds);
  const maxCount = counts[0]?.nodeCount || 1;

  // Countries with no known centroid are left off rather than plotted at a
  // fallback point -- several unrelated countries stacked on one dot would read
  // as a real cluster. The gap is surfaced below rather than hidden.
  const bubbles = counts
    .map((c) => {
      const centroid = getCountryCentroid(c.countryCode);
      if (!centroid) return null;
      const [lat, lon] = centroid;
      const ratio = c.nodeCount / maxCount;
      // sqrt scale so bubble AREA (not radius) tracks node count -- the usual
      // cartographic convention for proportional-symbol maps.
      const radius = MIN_RADIUS_PX + (MAX_RADIUS_PX - MIN_RADIUS_PX) * Math.sqrt(ratio);
      return { ...c, coordinates: [lon, lat], radius };
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
            <ComposableMap
              projection="geoNaturalEarth1"
              projectionConfig={{ scale: BASE_SCALE }}
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              className="wm-svg"
            >
              {/*
                Framing only. filterZoomEvent turns off drag-pan and
                scroll-zoom: the map is driven by the scope selector above it,
                and a map that can be dragged out of sync with the control that
                owns it is worse than one that cannot be dragged. It also stops
                a drag being mistaken for a click on a bubble.
              */}
              <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={12} filterZoomEvent={() => false}>
                <Graticule className="wm-graticule-line" step={[30, 30]} />

                <Geographies geography={worldAtlas}>
                  {({ geographies }) =>
                    geographies.map((geo) => (
                      <Geography key={geo.rsmKey} geography={geo} className="wm-country" tabIndex={-1} />
                    ))
                  }
                </Geographies>

                {bubbles.map((b) => {
                  const isSelected = selectedCountry && b.countryCode === selectedCountry;
                  const label = `${b.country}: ${fmtNum(b.nodeCount)} nodes`;
                  // Radii are in map units, which ZoomableGroup scales. Dividing
                  // by the zoom keeps a bubble the same size on screen whether
                  // the view is the whole world or one continent -- otherwise
                  // zooming to Europe would inflate every dot ~5x and merge them.
                  const r = b.radius / zoom;
                  return (
                      <Marker
                        key={b.countryCode}
                        coordinates={b.coordinates}
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
                      >
                        <circle r={r} className="wm-bubble-dot" strokeWidth={1 / zoom} />
                        {isSelected && (
                          <circle r={r + 3 / zoom} className="wm-bubble-ring" strokeWidth={2 / zoom} fill="none" />
                        )}
                        {/*
                          Native SVG <title> rather than Blueprint's Tooltip2.
                          Tooltip2 renders a <span class="bp4-popover2-target">
                          around its child, and a span created in the SVG
                          namespace is not a valid SVG element -- the browser
                          keeps it in the DOM and paints nothing inside it, so
                          every bubble silently disappeared while still being
                          query-able and clickable. <title> is the mechanism SVG
                          actually has for this, and it reaches screen readers
                          too.
                        */}
                        <title>{label}</title>
                      </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>
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
