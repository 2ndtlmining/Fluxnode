/*
 * Bounding boxes for zooming the Network map (issue #254).
 *
 * Boxes are [south, west, north, east] in degrees. They are generous rather
 * than tight -- the job is to frame a continent recognisably, not to clip it
 * exactly, and a box slightly too large is far less jarring than one that cuts
 * the corner off Scandinavia.
 *
 * Continent names are the strings the geolocation feed actually returns
 * (fluxinfo's `geolocation.continent`), verified live: Europe, North America,
 * South America, Asia, Africa, Oceania.
 */

export const WORLD_BOUNDS = [-90, -180, 90, 180];

export const CONTINENT_BOUNDS = {
  Europe: [34, -25, 71, 45],
  'North America': [7, -170, 72, -52],
  'South America': [-56, -82, 13, -34],
  Asia: [-11, 26, 78, 180],
  Africa: [-35, -18, 38, 52],
  Oceania: [-48, 110, 0, 180]
};

/*
 * A COUNTRY zooms to its continent, not to itself.
 *
 * The map draws one bubble per country, so cropping to a single country would
 * frame a lone dot on an empty stretch of coastline -- technically a zoom,
 * visually a dead end. Keeping the continent view means the selected country
 * can be highlighted in the context of its neighbours, which is the thing
 * actually worth seeing.
 */
export function boundsFor(scope) {
  const key = scope?.level === 'country' || scope?.level === 'continent' ? scope.continent : null;
  return CONTINENT_BOUNDS[key] || WORLD_BOUNDS;
}

/*
 * The SVG viewBox for a box.
 *
 * WorldMap draws its landmass with viewBox "0 0 360 180" and
 * preserveAspectRatio="none", so the SVG's coordinate space IS
 * (lon + 180, 90 - lat). Converting a bounds box is therefore a direct
 * translation with no projection maths.
 */
export function viewBoxFor(bounds) {
  const [south, west, north, east] = bounds || WORLD_BOUNDS;
  const x = west + 180;
  const y = 90 - north;
  return `${x} ${y} ${east - west} ${north - south}`;
}

/*
 * A whole-world percentage position, restated relative to the zoomed box.
 *
 * Bubbles are HTML elements positioned in percent inside the same frame as the
 * SVG, so they have to be remapped by the same box the viewBox came from --
 * otherwise the pings drift off their countries as soon as anything zooms.
 *
 * Deliberately does NOT clamp: a result outside 0-100 means the point is off
 * the current view, and the caller hides it rather than pinning it to an edge
 * where it would read as a real node in the wrong place.
 */
export function remapToBounds({ xPct, yPct }, bounds) {
  const [south, west, north, east] = bounds || WORLD_BOUNDS;

  const x0 = ((west + 180) / 360) * 100;
  const x1 = ((east + 180) / 360) * 100;
  const y0 = ((90 - north) / 180) * 100;
  const y1 = ((90 - south) / 180) * 100;

  return {
    xPct: ((xPct - x0) / (x1 - x0)) * 100,
    yPct: ((yPct - y0) / (y1 - y0)) * 100
  };
}
