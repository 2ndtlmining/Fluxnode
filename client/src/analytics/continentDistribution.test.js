import { rollupByContinent } from './continentDistribution';

describe('rollupByContinent', () => {
  it('counts nodes per continent and sorts descending', () => {
    const geoEntries = [
      { geolocation: { continent: 'North America', countryCode: 'US' } },
      { geolocation: { continent: 'Europe', countryCode: 'DE' } },
      { geolocation: { continent: 'North America', countryCode: 'CA' } },
      { geolocation: { continent: 'North America', countryCode: 'US' } },
    ];
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([
      { continent: 'North America', nodeCount: 3 },
      { continent: 'Europe', nodeCount: 1 },
    ]);
    expect(networkTotal).toBe(4);
  });

  it('still counts a node with geolocation but no continent toward the network total, just not toward any continent row', () => {
    const geoEntries = [
      { geolocation: { continent: 'Asia', countryCode: 'JP' } },
      { geolocation: { countryCode: 'ZZ' } },
    ];
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([{ continent: 'Asia', nodeCount: 1 }]);
    expect(networkTotal).toBe(2);
  });

  it('skips entries with no geolocation at all, rather than throwing', () => {
    const geoEntries = [{ geolocation: { continent: 'Asia', countryCode: 'JP' } }, {}, { geolocation: null }];
    expect(() => rollupByContinent(geoEntries)).not.toThrow();
    const { continents, networkTotal } = rollupByContinent(geoEntries);
    expect(continents).toEqual([{ continent: 'Asia', nodeCount: 1 }]);
    expect(networkTotal).toBe(1);
  });

  it('returns an empty result for no entries', () => {
    expect(rollupByContinent([])).toEqual({ continents: [], networkTotal: 0 });
    expect(rollupByContinent(undefined)).toEqual({ continents: [], networkTotal: 0 });
  });
});
