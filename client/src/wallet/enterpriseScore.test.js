import { sumEnterpriseScore } from './enterpriseScore';

/*
 * Issue #257 -- with Privacy Mode on, the enterprise node score read 0 for
 * every wallet.
 *
 * MainApp passed the RAW ?wallet= param to the filter. LayoutContext has
 * already masked that param in place by then, so the comparison was against a
 * row of X's, matched nothing, and summed to zero -- silently, and
 * indistinguishably from a wallet that genuinely has no enterprise nodes.
 */
const NODES = [
  { payment_address: 't1alice', score: 40 },
  { payment_address: 't1alice', score: 60 },
  { payment_address: 't1bob', score: 15 },
  { payment_address: 't1carol' },            // score missing
];

describe('sumEnterpriseScore', () => {
  it('sums every enterprise node belonging to the wallet', () => {
    expect(sumEnterpriseScore(NODES, 't1alice')).toBe(100);
  });

  it('is zero for a wallet with no enterprise nodes', () => {
    expect(sumEnterpriseScore(NODES, 't1nobody')).toBe(0);
  });

  it('never matches a MASKED address, which is what #257 was', () => {
    // hide_sensitive_string turns every alphanumeric into X.
    expect(sumEnterpriseScore(NODES, 'XXXXXXX')).toBe(0);
  });

  it('treats a missing score as zero rather than producing NaN', () => {
    // One undefined score used to poison the whole running total.
    expect(sumEnterpriseScore(NODES, 't1carol')).toBe(0);
    expect(Number.isNaN(sumEnterpriseScore(NODES, 't1carol'))).toBe(false);
  });

  it('is zero for no wallet at all rather than summing the whole network', () => {
    expect(sumEnterpriseScore(NODES, null)).toBe(0);
    expect(sumEnterpriseScore(NODES, '')).toBe(0);
    expect(sumEnterpriseScore(NODES, undefined)).toBe(0);
  });

  it('survives a missing node list', () => {
    expect(sumEnterpriseScore(null, 't1alice')).toBe(0);
    expect(sumEnterpriseScore(undefined, 't1alice')).toBe(0);
  });
});
