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
 * The same bounds box, restated as the (center, zoom) pair react-simple-maps
 * frames by (issue #290).
 *
 * The boxes above stay the single source of truth for what selecting a
 * continent means; only the units the renderer wants have changed.
 *
 * Zoom takes the SMALLER of the two axis ratios deliberately. Europe spans 70°
 * of longitude (360/70 = 5.14) and 37° of latitude (180/37 = 4.86); taking the
 * larger would fill the frame horizontally and crop Scandinavia off the top,
 * which is exactly the "cuts the corner off Scandinavia" failure the boxes were
 * written generously to avoid.
 *
 * Clamped at 1 so a box wider than the world cannot zoom out past it and leave
 * the map floating in empty space.
 */
export function mapFrameFor(bounds) {
  const box = Array.isArray(bounds) && bounds.length === 4 ? bounds : WORLD_BOUNDS;
  const [south, west, north, east] = box;

  const lonSpan = east - west;
  const latSpan = north - south;
  if (!(lonSpan > 0) || !(latSpan > 0)) {
    return { center: [0, 0], zoom: 1 };
  }

  return {
    center: [(west + east) / 2, (south + north) / 2],
    zoom: Math.max(1, Math.min(360 / lonSpan, 180 / latSpan))
  };
}
