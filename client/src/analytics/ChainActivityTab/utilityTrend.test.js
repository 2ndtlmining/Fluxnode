import { buildTrendSeries } from './utilityTrend';

describe('buildTrendSeries', () => {
  it('maps daily entries to chart rows with a short label', () => {
    const daily = [
      { date: '2026-09-09', utilityBlocks: 100, emptyBlocks: 200 },
      { date: '2026-09-10', utilityBlocks: 490, emptyBlocks: 2390 },
    ];
    expect(buildTrendSeries(daily)).toEqual([
      { date: '2026-09-09', label: '09-09', utility: 100, empty: 200 },
      { date: '2026-09-10', label: '09-10', utility: 490, empty: 2390 },
    ]);
  });

  it('defaults missing counts to 0 rather than undefined', () => {
    expect(buildTrendSeries([{ date: '2026-09-10' }])).toEqual([
      { date: '2026-09-10', label: '09-10', utility: 0, empty: 0 },
    ]);
  });

  it('handles an empty or missing array', () => {
    expect(buildTrendSeries([])).toEqual([]);
    expect(buildTrendSeries(null)).toEqual([]);
  });

  it('leaves a malformed date string as its own label rather than throwing', () => {
    expect(buildTrendSeries([{ date: 'oops', utilityBlocks: 1, emptyBlocks: 2 }])).toEqual([
      { date: 'oops', label: 'oops', utility: 1, empty: 2 },
    ]);
  });
});
