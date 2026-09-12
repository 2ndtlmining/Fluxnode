import { formatHostLocation, formatUptime, hostInfoSegments } from './hostInfo';

/*
 * Issue #145 -- "Hosted in …" and uptime in the footer, mirroring Fluxtracker.
 *
 * Every field from /api/v1/header is optional: the geolocation lookup can fail,
 * /proc is unreadable off Linux, and the endpoint itself does not exist on a
 * static-only deploy. So the rule throughout is that a missing field removes
 * its segment rather than rendering "Hosted in undefined".
 */
describe('formatHostLocation', () => {
  it('reads as city and country together', () => {
    expect(formatHostLocation({ city: 'Melbourne', country: 'Australia' })).toBe('Melbourne, Australia');
  });

  it('falls back to country alone when the city is unknown', () => {
    expect(formatHostLocation({ country: 'Finland' })).toBe('Finland');
  });

  it('falls back to city alone when the country is unknown', () => {
    expect(formatHostLocation({ city: 'Helsinki' })).toBe('Helsinki');
  });

  it('falls back to the country CODE when no country name was returned', () => {
    // ipinfo.io answers with country: "AU" and no full name; ip-api.com gives
    // "Australia". The chain means either can win, so both must render.
    expect(formatHostLocation({ city: 'Melbourne', countryCode: 'AU' })).toBe('Melbourne, AU');
  });

  it('prefers the country NAME over the code when both are present', () => {
    expect(formatHostLocation({ city: 'Melbourne', country: 'Australia', countryCode: 'AU' }))
      .toBe('Melbourne, Australia');
  });

  it('uses the code alone when that is all there is', () => {
    expect(formatHostLocation({ countryCode: 'FI' })).toBe('FI');
  });

  it('is null when nothing is known, so the segment can be dropped entirely', () => {
    expect(formatHostLocation({})).toBeNull();
    expect(formatHostLocation(null)).toBeNull();
    expect(formatHostLocation(undefined)).toBeNull();
  });

  it('ignores blank strings rather than rendering a stray comma', () => {
    expect(formatHostLocation({ city: '', country: 'Australia' })).toBe('Australia');
    expect(formatHostLocation({ city: '   ', country: '' })).toBeNull();
  });
});

describe('formatUptime', () => {
  it('reads in days and hours once past a day', () => {
    expect(formatUptime(864321)).toBe('10d 0h');
    expect(formatUptime(90000)).toBe('1d 1h');
  });

  it('drops to hours and minutes under a day', () => {
    expect(formatUptime(3660)).toBe('1h 1m');
  });

  it('drops to minutes under an hour', () => {
    expect(formatUptime(300)).toBe('5m');
  });

  it('says less than a minute rather than "0m" for a fresh start', () => {
    expect(formatUptime(30)).toBe('<1m');
    expect(formatUptime(0)).toBe('<1m');
  });

  it('is null for a missing or nonsensical value', () => {
    expect(formatUptime(null)).toBeNull();
    expect(formatUptime(undefined)).toBeNull();
    expect(formatUptime(-5)).toBeNull();
    expect(formatUptime('lots')).toBeNull();
  });
});

describe('hostInfoSegments', () => {
  const full = { host: { location: { city: 'Helsinki', country: 'Finland' }, appUptimeSeconds: 90000 } };

  /*
   * Issue #285 wants the location emphasised, so segments carry a `kind` --
   * the footer cannot style one of them apart while they are interchangeable
   * strings joined by a separator.
   */
  it('produces the location and uptime segments, each identified', () => {
    expect(hostInfoSegments(full)).toEqual([
      { kind: 'location', text: 'Hosted in Helsinki, Finland' },
      { kind: 'uptime', text: 'Up 1d 1h' },
    ]);
  });

  it('drops the location segment when the lookup failed', () => {
    expect(hostInfoSegments({ host: { location: null, appUptimeSeconds: 300 } })).toEqual([
      { kind: 'uptime', text: 'Up 5m' },
    ]);
  });

  it('drops the uptime segment when it is unavailable', () => {
    expect(hostInfoSegments({ host: { location: { country: 'Finland' } } })).toEqual([
      { kind: 'location', text: 'Hosted in Finland' },
    ]);
  });

  /*
   * The emphasis must not strand a separator. With no location there is no
   * location segment at all, so the footer has nothing to hang a stray dot off.
   */
  it('leaves no location segment behind when only uptime is known', () => {
    const segs = hostInfoSegments({ host: { location: {}, appUptimeSeconds: 60 } });
    expect(segs.some((s) => s.kind === 'location')).toBe(false);
    expect(segs).toHaveLength(1);
  });

  it('is empty when the endpoint gave nothing usable, so the footer is unchanged', () => {
    // A static-only deploy has no Rust API at all -- the footer must look
    // exactly as it did before this feature.
    expect(hostInfoSegments(null)).toEqual([]);
    expect(hostInfoSegments({})).toEqual([]);
    expect(hostInfoSegments({ host: {} })).toEqual([]);
  });
});
