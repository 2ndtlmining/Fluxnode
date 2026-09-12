import { CONTINENT_BOUNDS, boundsFor, mapFrameFor, WORLD_BOUNDS } from './regionBounds';

/*
 * Issue #254 -- zooming the Network map to a continent.
 *
 * The map is an SVG landmass plus percentage-positioned HTML bubbles. Both have
 * to move together or the pings drift off their countries, so the viewBox and
 * the bubble remap are derived from ONE bounds object rather than tuned
 * separately.
 */
describe('CONTINENT_BOUNDS', () => {
  it('covers every continent the geolocation feed actually reports', () => {
    // These are the values seen live: the feed's `continent` strings.
    for (const c of ['Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania']) {
      expect(CONTINENT_BOUNDS[c]).toBeDefined();
    }
  });

  it('states every box as [south, west, north, east] within real world limits', () => {
    for (const [name, b] of Object.entries(CONTINENT_BOUNDS)) {
      const [south, west, north, east] = b;
      expect(north).toBeGreaterThan(south);
      expect(east).toBeGreaterThan(west);
      expect(south).toBeGreaterThanOrEqual(-90);
      expect(north).toBeLessThanOrEqual(90);
      expect(west).toBeGreaterThanOrEqual(-180);
      expect(east).toBeLessThanOrEqual(180);
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it('places Europe north of the equator and around the prime meridian', () => {
    const [south, west, north, east] = CONTINENT_BOUNDS.Europe;
    expect(south).toBeGreaterThan(30);
    expect(north).toBeLessThan(82);
    expect(west).toBeLessThan(0);
    expect(east).toBeGreaterThan(0);
  });
});

describe('boundsFor', () => {
  it('gives the whole world at network level', () => {
    expect(boundsFor({ level: 'network' })).toEqual(WORLD_BOUNDS);
  });

  it('gives the continent box when a continent is selected', () => {
    expect(boundsFor({ level: 'continent', continent: 'Europe' })).toEqual(CONTINENT_BOUNDS.Europe);
  });

  it('zooms a COUNTRY to its containing continent, not to the country', () => {
    // A country holds one bubble; cropping to it would show a single dot on an
    // empty coastline. The continent keeps it in context.
    expect(boundsFor({ level: 'country', continent: 'Europe', country: 'DE' })).toEqual(CONTINENT_BOUNDS.Europe);
  });

  it('falls back to the world for anywhere it does not know', () => {
    expect(boundsFor({ level: 'continent', continent: 'Atlantis' })).toEqual(WORLD_BOUNDS);
    expect(boundsFor({ level: 'continent', continent: 'Unlocated' })).toEqual(WORLD_BOUNDS);
    expect(boundsFor()).toEqual(WORLD_BOUNDS);
  });
});

/*
 * Issue #290: the map moved to react-simple-maps, which frames by
 * (center, zoom) rather than an SVG viewBox. These bounds boxes stay the single
 * source of truth for what a continent selection means -- this just restates
 * one in the units the new renderer wants, so zoom-to-scope survives the swap.
 */
describe('mapFrameFor', () => {
  test('the whole world is centred at the origin, unzoomed', () => {
    expect(mapFrameFor(WORLD_BOUNDS)).toEqual({ center: [0, 0], zoom: 1 });
  });

  test('centres on the middle of the box', () => {
    // Europe: [34, -25, 71, 45] -> lon (-25+45)/2 = 10, lat (34+71)/2 = 52.5
    expect(mapFrameFor(CONTINENT_BOUNDS.Europe).center).toEqual([10, 52.5]);
  });

  test('zooms by whichever axis is the tighter fit, so nothing is cropped', () => {
    // Europe spans 70 deg lon (360/70 = 5.14) and 37 deg lat (180/37 = 4.86).
    // Taking the LARGER would crop the top and bottom off the continent.
    expect(mapFrameFor(CONTINENT_BOUNDS.Europe).zoom).toBeCloseTo(4.86, 2);
  });

  test('never zooms out past the whole world', () => {
    // A box larger than the world would otherwise produce a zoom below 1.
    expect(mapFrameFor([-90, -360, 90, 360]).zoom).toBe(1);
  });

  test('falls back to the world view for missing or malformed bounds', () => {
    const world = { center: [0, 0], zoom: 1 };
    expect(mapFrameFor(null)).toEqual(world);
    expect(mapFrameFor(undefined)).toEqual(world);
  });

  test('gives every real continent a usable frame', () => {
    for (const [name, bounds] of Object.entries(CONTINENT_BOUNDS)) {
      const frame = mapFrameFor(bounds);
      expect(Number.isFinite(frame.center[0])).toBe(true);
      expect(Number.isFinite(frame.center[1])).toBe(true);
      expect(frame.zoom).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(frame.zoom)).toBe(true);
      expect(name).toBeTruthy();
    }
  });
});
