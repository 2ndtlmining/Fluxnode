import fs from 'fs';
import path from 'path';
import { buildTierResolver } from 'apidata';

/*
 * Closes the loop on issue #215: the harness found the bug, and this runs the
 * SHIPPED resolver against the same live fixture to prove the fix holds on real
 * data rather than only on the hand-built cases in tierResolver.test.js.
 *
 * Unit tests pin the rules. This pins the OUTCOME -- that on ~6200 real nodes
 * the resolver produces per-tier totals matching the daemon's own
 * getzelnodecount, which is the check that identified which of the two joins
 * was wrong in the first place. The old host-collapsed map reported MORE Nimbus
 * and Stratus nodes than exist; that impossibility is what gave the bug away.
 *
 * Inert without fixtures, like the other app-side audit tests: a fresh clone or
 * CI run skips it. Run `python tools/audit/capture.py` to arm it.
 */

const FIXTURE_DIR = path.join(__dirname, '..', '..', '..', 'tools', 'audit', 'fixtures', 'latest');
const NODES = path.join(FIXTURE_DIR, 'fluxnodes.json');
const BENCH = path.join(FIXTURE_DIR, 'benchmarks.json');
const COUNTS = path.join(FIXTURE_DIR, 'getzelnodecount.json');

const armed = fs.existsSync(NODES) && fs.existsSync(BENCH) && fs.existsSync(COUNTS);
const whenArmed = armed ? describe : describe.skip;

// The daemon reports every ENABLED node; only some are benchmarked, so the
// resolver's totals are expected to sit slightly BELOW the official counts.
// This bound is what separates "a few un-benchmarked nodes" from "a systematic
// misassignment": the old code overshot Nimbus by 415 and Stratus by 222.
const MAX_SHORTFALL = 150;

whenArmed('#215 -- tier resolution against the live fixture', () => {
  const nodes = JSON.parse(fs.readFileSync(NODES, 'utf8')).fluxNodes || [];
  const bench = JSON.parse(fs.readFileSync(BENCH, 'utf8')).data || [];
  const official = (() => {
    const raw = JSON.parse(fs.readFileSync(COUNTS, 'utf8'));
    return raw.data || raw;
  })();

  const resolve = buildTierResolver(nodes);
  const VALID = ['CUMULUS', 'NIMBUS', 'STRATUS'];

  const tally = { CUMULUS: 0, NIMBUS: 0, STRATUS: 0 };
  let unresolved = 0;
  for (const entry of bench) {
    const ipaddress = entry?.benchmark?.bench?.ipaddress;
    if (!ipaddress) continue;
    const tier = resolve(ipaddress);
    if (tier && VALID.includes(tier)) tally[tier] += 1;
    else unresolved += 1;
  }

  it.each(VALID)('%s total is at or below the daemon count, and close to it', (tier) => {
    const officialCount = official[`${tier.toLowerCase()}-enabled`] || 0;
    expect(officialCount).toBeGreaterThan(0);

    // Never MORE than exist. The old code failed exactly here.
    expect(tally[tier]).toBeLessThanOrEqual(officialCount);

    // ...and not wildly fewer, which would mean nodes are being dropped.
    expect(officialCount - tally[tier]).toBeLessThanOrEqual(MAX_SHORTFALL);
  });

  it('resolves nearly every benchmarked node', () => {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    // A handful of benchmarked nodes have no matching fluxNodes entry at all;
    // that predates this fix and is not something the resolver can mend.
    expect(unresolved / (total + unresolved)).toBeLessThan(0.01);
  });

  it('gives distinct tiers to nodes sharing a host, where the ports say so', () => {
    // The bug in one assertion. Find a host whose entries span >1 tier and
    // confirm the resolver no longer flattens them.
    const byHost = new Map();
    for (const n of nodes) {
      const raw = n?.ip || '';
      if (!raw || !n.tier) continue;
      const host = raw.split(':')[0];
      if (!byHost.has(host)) byHost.set(host, new Map());
      byHost.get(host).set(raw, n.tier.toUpperCase());
    }

    const mixed = [...byHost.values()].find((entries) => new Set(entries.values()).size > 1);
    expect(mixed).toBeDefined(); // mixed-tier hosts genuinely exist in this data

    for (const [rawIp, expectedTier] of mixed) {
      expect(resolve(rawIp)).toBe(expectedTier);
    }
    // And collectively they are NOT all the same tier, which is what the old
    // host-collapsed map produced.
    const resolved = new Set([...mixed.keys()].map((ip) => resolve(ip)));
    expect(resolved.size).toBeGreaterThan(1);
  });
});
