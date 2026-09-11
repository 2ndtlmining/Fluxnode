import { CONTINENT_BOUNDS, boundsFor, viewBoxFor, remapToBounds, WORLD_BOUNDS } from './regionBounds';

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

describe('viewBoxFor', () => {
  it('is the full equirectangular frame for the world', () => {
    expect(viewBoxFor(WORLD_BOUNDS)).toBe('0 0 360 180');
  });

  it('converts a box to the map\'s lon+180 / 90-lat coordinate space', () => {
    // [south, west, north, east] = [0, 0, 90, 90]
    //   x = west + 180 = 180, y = 90 - north = 0, w = 90, h = 90
    expect(viewBoxFor([0, 0, 90, 90])).toBe('180 0 90 90');
  });
});

describe('remapToBounds', () => {
  it('leaves percentages untouched for the world view', () => {
    expect(remapToBounds({ xPct: 25, yPct: 40 }, WORLD_BOUNDS)).toEqual({ xPct: 25, yPct: 40 });
  });

  it('rescales a point into the zoomed box', () => {
    // Box covering the eastern/northern quarter: x 50..100%, y 0..50%.
    // A point at 75%,25% sits dead centre of it.
    const out = remapToBounds({ xPct: 75, yPct: 25 }, [0, 0, 90, 180]);
    expect(out.xPct).toBeCloseTo(50, 6);
    expect(out.yPct).toBeCloseTo(50, 6);
  });

  it('reports points outside the box as outside, so they can be hidden', () => {
    const out = remapToBounds({ xPct: 10, yPct: 90 }, [0, 0, 90, 180]);
    expect(out.xPct < 0 || out.xPct > 100 || out.yPct < 0 || out.yPct > 100).toBe(true);
  });
});
