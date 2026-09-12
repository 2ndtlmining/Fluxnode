import { richListBand, richListRank, RICH_LIST_BANDS } from './richList';

/*
 * Issue #266 -- "whale" was a single binary flag.
 *
 * /statistics/richest-addresses-list returns 1,000 entries sorted by balance
 * descending. Rank 1 held 160,000,029 FLUX and rank 1,000 held 26,974 when this
 * was written -- a ~5,900x spread that produced identical treatment. The top 100
 * alone hold 82.6% of the listed balance.
 *
 * Bands are RANK-based, never balance-based: those balances move daily, so a
 * hardcoded "320,000 FLUX = top 100" would be wrong within days.
 */
const list = (n) => Array.from({ length: n }, (_, i) => ({ address: `t1addr${i + 1}`, balance: 1000 - i }));

describe('richListRank', () => {
  it('is 1-based, so the richest address is rank 1 rather than 0', () => {
    expect(richListRank(list(10), 't1addr1')).toBe(1);
  });

  it('finds an address further down the list', () => {
    expect(richListRank(list(1000), 't1addr500')).toBe(500);
  });

  it('is null for an address that is not listed', () => {
    expect(richListRank(list(10), 't1nobody')).toBeNull();
  });

  it('is null for a missing list or address', () => {
    expect(richListRank(null, 't1addr1')).toBeNull();
    expect(richListRank(list(10), null)).toBeNull();
    expect(richListRank(undefined, undefined)).toBeNull();
  });

  it('tolerates malformed entries rather than throwing', () => {
    expect(richListRank([null, {}, { address: 't1a' }], 't1a')).toBe(3);
  });
});

describe('richListBand', () => {
  it('puts the very top of the list in the top band', () => {
    expect(richListBand(1)).toBe('top100');
    expect(richListBand(100)).toBe('top100');
  });

  it('starts the middle band at 101', () => {
    // The boundary is the whole point of this issue -- 100 and 101 must differ.
    expect(richListBand(101)).toBe('top500');
    expect(richListBand(500)).toBe('top500');
  });

  it('starts the entry band at 501', () => {
    expect(richListBand(501)).toBe('top1000');
    expect(richListBand(1000)).toBe('top1000');
  });

  it('still bands a rank beyond 1000, in case the list ever grows', () => {
    // The list is 1,000 today but that is the explorer's choice, not ours.
    expect(richListBand(1001)).toBe('top1000');
  });

  it('is null for an unranked wallet', () => {
    expect(richListBand(null)).toBeNull();
    expect(richListBand(undefined)).toBeNull();
    expect(richListBand(0)).toBeNull();
    expect(richListBand(-3)).toBeNull();
  });

  it('describes every band it can return', () => {
    for (const band of ['top100', 'top500', 'top1000']) {
      expect(RICH_LIST_BANDS[band]).toBeDefined();
      expect(typeof RICH_LIST_BANDS[band].label).toBe('string');
      expect(RICH_LIST_BANDS[band].label.length).toBeGreaterThan(0);
    }
  });
});
