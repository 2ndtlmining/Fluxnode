import { geoPanelState } from './networkPanels';

/*
 * Issue #250 -- the NODE DISTRIBUTION panel rendered a spinner whenever
 * countryCounts was empty, and the fetch swallowed its own errors with
 * `.catch(() => {})`. "Still loading", "loaded but empty" and "the fetch
 * failed" were therefore indistinguishable, and a failure looked like an
 * infinite spinner.
 */
describe('geoPanelState', () => {
  it('is loading before the fetch has resolved', () => {
    expect(geoPanelState({ countryCounts: [], failed: false, settled: false })).toBe('loading');
  });

  it('is failed when the fetch rejected, rather than spinning forever', () => {
    expect(geoPanelState({ countryCounts: [], failed: true, settled: true })).toBe('failed');
  });

  it('is empty when the fetch succeeded but returned nothing', () => {
    expect(geoPanelState({ countryCounts: [], failed: false, settled: true })).toBe('empty');
  });

  it('is ready once there are countries to draw', () => {
    expect(
      geoPanelState({ countryCounts: [{ countryCode: 'DE', nodeCount: 5 }], failed: false, settled: true })
    ).toBe('ready');
  });

  it('prefers showing data over reporting a failure from a later refresh', () => {
    // A background refresh that fails must not blank a panel that already
    // has good data on screen.
    expect(
      geoPanelState({ countryCounts: [{ countryCode: 'DE', nodeCount: 5 }], failed: true, settled: true })
    ).toBe('ready');
  });

  it('treats a missing counts array as no data rather than throwing', () => {
    expect(geoPanelState({ countryCounts: undefined, failed: false, settled: false })).toBe('loading');
    expect(geoPanelState({})).toBe('loading');
  });
});
