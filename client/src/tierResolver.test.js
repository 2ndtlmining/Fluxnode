import { buildTierResolver } from './apidata';

/*
 * Issue #215. apidata.js used to build its ip->tier map as:
 *
 *     ipTierMap[node.ip.split(':')[0]] = node.tier
 *
 * One host can run several Flux nodes OF DIFFERENT TIERS. Collapsing to the
 * bare host made them collide, and whichever entry the API returned last won
 * for all of them. Measured on a live fixture: 254 hosts run mixed tiers, and
 * 788 of 6237 benchmarked nodes (12.6%) were given the wrong one -- always
 * upward, because the API returns a host's nodes in ascending-tier order. So
 * Cumulus operators were ranked against Nimbus and Stratus hardware and judged
 * for medals against that population.
 *
 * Both feeds carry the port that distinguishes these nodes; `.split(':')[0]`
 * discarded exactly the field that made them separable.
 *
 * The resolver's rules, and why each exists (all three measured against a live
 * fixture, 2026-09-11):
 *
 *   1. Exact match on the ip string as it appears  -- 4035 benchmark entries.
 *   2. Bare ip, when both feeds report it bare     -- 2151 entries. Falls out
 *      of rule 1 for free, since the key is the raw string.
 *   3. Host fallback ONLY when that host runs a single tier -- 60 entries
 *      where the two feeds disagree about whether to include a port. Safe
 *      precisely because there is no ambiguity to resolve.
 *   4. Refuse when the host runs mixed tiers and no exact key matched --
 *      0 entries today. Guessing here is what caused the bug; the resolver
 *      returns null and the caller drops the node, as it already does for an
 *      unknown host.
 */

describe('buildTierResolver (issue #215)', () => {
  it('gives each node on a mixed-tier host its OWN tier', () => {
    // The bug, reduced. Before the fix every one of these resolved to STRATUS,
    // because it appeared last.
    const resolve = buildTierResolver([
      { ip: '77.132.58.19:16137', tier: 'CUMULUS' },
      { ip: '77.132.58.19:16147', tier: 'CUMULUS' },
      { ip: '77.132.58.19:16157', tier: 'NIMBUS' },
      { ip: '77.132.58.19:16167', tier: 'STRATUS' },
    ]);

    expect(resolve('77.132.58.19:16137')).toBe('CUMULUS');
    expect(resolve('77.132.58.19:16147')).toBe('CUMULUS');
    expect(resolve('77.132.58.19:16157')).toBe('NIMBUS');
    expect(resolve('77.132.58.19:16167')).toBe('STRATUS');
  });

  it('normalises tier casing', () => {
    const resolve = buildTierResolver([{ ip: '1.2.3.4:16137', tier: 'cumulus' }]);
    expect(resolve('1.2.3.4:16137')).toBe('CUMULUS');
  });

  it('resolves a bare ip when both feeds report it bare', () => {
    const resolve = buildTierResolver([{ ip: '1.2.3.4', tier: 'NIMBUS' }]);
    expect(resolve('1.2.3.4')).toBe('NIMBUS');
  });

  it('falls back to the host when it runs a SINGLE tier', () => {
    // The feeds disagree about the port for this node. Unambiguous, so
    // resolvable -- 60 real entries depend on this.
    const resolve = buildTierResolver([
      { ip: '5.6.7.8:16137', tier: 'CUMULUS' },
      { ip: '5.6.7.8:16147', tier: 'CUMULUS' },
    ]);
    expect(resolve('5.6.7.8')).toBe('CUMULUS');
    expect(resolve('5.6.7.8:19999')).toBe('CUMULUS');
  });

  it('REFUSES to guess when the host runs mixed tiers and no exact key matches', () => {
    // This is the case the old code got wrong. Returning null makes the caller
    // drop the node, exactly as it already does for an unknown host -- far
    // better than silently filing it under an arbitrary tier.
    const resolve = buildTierResolver([
      { ip: '9.9.9.9:16137', tier: 'CUMULUS' },
      { ip: '9.9.9.9:16147', tier: 'STRATUS' },
    ]);
    expect(resolve('9.9.9.9')).toBeNull();
    expect(resolve('9.9.9.9:19999')).toBeNull();
    // ...but the exact keys still resolve.
    expect(resolve('9.9.9.9:16137')).toBe('CUMULUS');
    expect(resolve('9.9.9.9:16147')).toBe('STRATUS');
  });

  it('returns null for an unknown host', () => {
    const resolve = buildTierResolver([{ ip: '1.1.1.1:16137', tier: 'CUMULUS' }]);
    expect(resolve('2.2.2.2:16137')).toBeNull();
  });

  it('ignores entries with no ip, and handles junk input', () => {
    const resolve = buildTierResolver([
      { tier: 'CUMULUS' },
      { ip: '', tier: 'NIMBUS' },
      { ip: '3.3.3.3:16137', tier: 'STRATUS' },
    ]);
    expect(resolve('3.3.3.3:16137')).toBe('STRATUS');
    expect(resolve('')).toBeNull();
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it('handles a non-array input without throwing', () => {
    expect(buildTierResolver(null)('1.2.3.4')).toBeNull();
    expect(buildTierResolver(undefined)('1.2.3.4')).toBeNull();
  });

  it('treats a node with no tier as unresolvable rather than as a tier', () => {
    const resolve = buildTierResolver([{ ip: '4.4.4.4:16137' }]);
    expect(resolve('4.4.4.4:16137')).toBeNull();
  });
});
