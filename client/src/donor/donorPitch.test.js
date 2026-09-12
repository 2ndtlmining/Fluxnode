import { formatDonorCost, donorHighlights, DONOR_HIGHLIGHT_KEYS } from 'donor/donorPitch';
import { DONOR_THRESHOLD_FLUX } from 'donor/config';

describe('formatDonorCost', () => {
  test('converts the donor threshold at the live FLUX price', () => {
    // 10 FLUX x $0.0513 = $0.513
    expect(formatDonorCost(0.0513)).toBe(`${DONOR_THRESHOLD_FLUX} FLUX \u2248 $0.51`);
  });

  test('tracks the price rather than hardcoding a dollar figure', () => {
    expect(formatDonorCost(0.25)).toBe(`${DONOR_THRESHOLD_FLUX} FLUX \u2248 $2.50`);
  });

  test.each([0, null, undefined, NaN, -1])(
    'omits the dollar figure when the price is unusable (%p)',
    (price) => {
      expect(formatDonorCost(price)).toBe(`${DONOR_THRESHOLD_FLUX} FLUX`);
    }
  );
});

describe('donorHighlights', () => {
  const gstore = {
    node_count: { total: 6366 },
    runningCategoryMap: { Computing: 2219, Enterprise: 1832, Blockchain: 1157 },
  };
  const countryCounts = { US: 900, DE: 700, AU: 42 };

  const byKey = (list, key) => list.find((h) => h.key === key);

  test('puts the live node and country counts in the map teaser', () => {
    const teaser = byKey(donorHighlights({ gstore, countryCounts }), 'worldMap').teaser;
    expect(teaser).toContain('6,366');
    expect(teaser).toContain('3 countries');
  });

  test('falls back to generic copy when country data has not arrived', () => {
    const teaser = byKey(donorHighlights({ gstore, countryCounts: {} }), 'worldMap').teaser;
    expect(teaser).not.toContain('0 countries');
    expect(teaser.length).toBeGreaterThan(0);
  });

  test('sums the running-app categories into the ecosystem teaser', () => {
    // 2219 + 1832 + 1157 = 5208
    expect(byKey(donorHighlights({ gstore, countryCounts }), 'appEcosystem').teaser).toContain('5,208');
  });

  test('falls back when the running-app map has not arrived', () => {
    const bare = { node_count: { total: 6366 } };
    const teaser = byKey(donorHighlights({ gstore: bare, countryCounts }), 'appEcosystem').teaser;
    expect(teaser).not.toContain('0 ');
    expect(teaser.length).toBeGreaterThan(0);
  });

  test('returns a stable set of highlights so the panel does not reflow', () => {
    const keys = donorHighlights({ gstore, countryCounts }).map((h) => h.key);
    expect(keys).toEqual(DONOR_HIGHLIGHT_KEYS);
  });

  test('survives a completely empty store', () => {
    const keys = donorHighlights({ gstore: {}, countryCounts: null }).map((h) => h.key);
    expect(keys).toEqual(DONOR_HIGHLIGHT_KEYS);
  });
});
