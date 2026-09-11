import { buildTeamAppRows, formatExpiry } from './teamApps';

const TEAM = ['196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH'];
const OTHER = '164ubcHD6ERRkhg22qsSrvu7fHjdryJWUs';

function spec(overrides = {}) {
  return {
    name: 'app',
    owner: TEAM[0],
    instances: 1,
    cpu: 1,
    ram: 1024, // MB -- specResources divides by 1024 for GB
    hdd: 10,
    repotag: 'runonflux/thing:latest',
    height: 1000,
    expire: 22000,
    ...overrides,
  };
}

describe('buildTeamAppRows', () => {
  it('includes only specs owned by the team', () => {
    const result = buildTeamAppRows(
      [spec({ name: 'ours' }), spec({ name: 'theirs', owner: OTHER })],
      5000,
      TEAM
    );
    expect(result.rows.map((r) => r.name)).toEqual(['ours']);
  });

  it('sorts by instance count, biggest fleet first', () => {
    const result = buildTeamAppRows(
      [spec({ name: 'small', instances: 2 }), spec({ name: 'huge', instances: 100 }), spec({ name: 'mid', instances: 20 })],
      5000,
      TEAM
    );
    expect(result.rows.map((r) => r.name)).toEqual(['huge', 'mid', 'small']);
  });

  it('breaks an instance-count tie by name, so ordering is stable', () => {
    const result = buildTeamAppRows(
      [spec({ name: 'beta', instances: 5 }), spec({ name: 'alpha', instances: 5 })],
      5000,
      TEAM
    );
    expect(result.rows.map((r) => r.name)).toEqual(['alpha', 'beta']);
  });

  it('reports per-instance AND fleet-wide resources', () => {
    // The fleet figure is the one that explains the percentage: one app at 100
    // instances dominates fifty apps at one instance each.
    const [row] = buildTeamAppRows([spec({ instances: 10, cpu: 2, ram: 2048, hdd: 40 })], 5000, TEAM).rows;
    expect(row.cpuPerInst).toBe(2);
    expect(row.ramGBPerInst).toBe(2);
    expect(row.ssdGBPerInst).toBe(40);
    expect(row.totalCpu).toBe(20);
    expect(row.totalRamGB).toBe(20);
    expect(row.totalSsdGB).toBe(400);
  });

  it('defaults a missing instances field to 1 rather than 0', () => {
    // Older specs omit `instances`. Treating that as 0 would silently erase the
    // app from every total.
    const [row] = buildTeamAppRows([spec({ instances: undefined })], 5000, TEAM).rows;
    expect(row.instances).toBe(1);
  });

  it('sums compose components into one per-instance figure', () => {
    const [row] = buildTeamAppRows([
      spec({
        cpu: undefined, ram: undefined, hdd: undefined, repotag: undefined,
        compose: [
          { cpu: 1, ram: 1024, hdd: 10, repotag: 'runonflux/a:1' },
          { cpu: 3, ram: 3072, hdd: 20, repotag: 'runonflux/b:1' },
        ],
      }),
    ], 5000, TEAM).rows;
    expect(row.cpuPerInst).toBe(4);
    expect(row.ramGBPerInst).toBe(4);
    expect(row.ssdGBPerInst).toBe(30);
    expect(row.repotag).toBe('runonflux/a:1'); // component 0, per specResources
  });

  it('computes expiry from height + expire against the current block', () => {
    // height 1000 + expire 22000 = expiry block 23000; at block 5000 that is
    // 18000 blocks away.
    const [row] = buildTeamAppRows([spec({ height: 1000, expire: 22000 })], 5000, TEAM).rows;
    expect(row.expiresInBlocks).toBe(18000);
    expect(row.expiresAt).toBeGreaterThan(Date.now());
  });

  it('reports a past expiry as negative rather than clamping it', () => {
    const [row] = buildTeamAppRows([spec({ height: 1000, expire: 1000 })], 5000, TEAM).rows;
    expect(row.expiresInBlocks).toBe(-3000);
  });

  it('returns null expiry when the current block is unknown', () => {
    // Deriving a date from height 0 would render as 1970 and look like data.
    const [row] = buildTeamAppRows([spec()], 0, TEAM).rows;
    expect(row.expiresInBlocks).toBeNull();
    expect(row.expiresAt).toBeNull();
  });

  it('carries enterprise specs with null resources instead of dropping them', () => {
    // Enterprise specs ship an encrypted compose, so there is nothing to sum --
    // but the app still exists and still counts toward the instance share.
    const [row] = buildTeamAppRows([spec({ compose: [], enterprise: 'blob', cpu: undefined })], 5000, TEAM).rows;
    expect(row.isEnterprise).toBe(true);
    expect(row.cpuPerInst).toBeNull();
    expect(row.totalCpu).toBeNull();
    expect(row.instances).toBe(1);
  });

  it('totals across the fleet', () => {
    const result = buildTeamAppRows(
      [spec({ name: 'a', instances: 2, cpu: 1, ram: 1024, hdd: 10 }),
       spec({ name: 'b', instances: 3, cpu: 2, ram: 2048, hdd: 20 })],
      5000, TEAM
    );
    expect(result.totalApps).toBe(2);
    expect(result.totalInstances).toBe(5);
    expect(result.totalCpu).toBe(2 * 1 + 3 * 2);
    expect(result.totalRamGB).toBe(2 * 1 + 3 * 2);
    expect(result.totalSsdGB).toBe(2 * 10 + 3 * 20);
  });

  it('handles missing, empty and malformed input without throwing', () => {
    expect(buildTeamAppRows(null, 5000, TEAM).rows).toEqual([]);
    expect(buildTeamAppRows([], 5000, TEAM).rows).toEqual([]);
    expect(buildTeamAppRows([null, {}, { owner: null }], 5000, TEAM).rows).toEqual([]);
  });
});

describe('formatExpiry', () => {
  it('renders days beyond a day out', () => {
    expect(formatExpiry(2880 * 34)).toBe('in 34 days');
    expect(formatExpiry(2880)).toBe('in 1 day');
  });

  it('renders hours within a day', () => {
    expect(formatExpiry(120 * 6)).toBe('in 6 hours'); // 120 blocks = 1 hour
    expect(formatExpiry(120)).toBe('in 1 hour');
  });

  it('never renders "in 0 hours" for an imminent expiry', () => {
    // Rounding 4 blocks (2 minutes) down to zero would read as "in 0 hours",
    // which says nothing useful.
    expect(formatExpiry(4)).toBe('in 1 hour');
  });

  it('says expired rather than a negative duration', () => {
    expect(formatExpiry(0)).toBe('expired');
    expect(formatExpiry(-500)).toBe('expired');
  });

  it('returns null when expiry is unknown', () => {
    expect(formatExpiry(null)).toBeNull();
    expect(formatExpiry(undefined)).toBeNull();
  });
});

describe('buildTeamAppRows category (issue #229)', () => {
  const TEAM = ['team-zelid'];

  it('categorises a row using the same categoriser as the rest of the Apps tab', () => {
    const specs = [
      { name: 'fah', owner: 'team-zelid', instances: 3, compose: [{ repotag: 'runonflux/folding-at-home:latest', cpu: 1, ram: 1024, hdd: 10 }] },
    ];
    const { rows } = buildTeamAppRows(specs, 0, TEAM);
    expect(rows[0].category).toBe('computing');
  });

  it('marks an encrypted enterprise spec as enterprise rather than other', () => {
    const specs = [
      { name: 'secret', owner: 'team-zelid', instances: 1, enterprise: true, compose: [] },
    ];
    const { rows } = buildTeamAppRows(specs, 0, TEAM);
    expect(rows[0].category).toBe('enterprise');
  });

  it('falls back to other for an unrecognised image', () => {
    const specs = [
      { name: 'mystery', owner: 'team-zelid', instances: 1, compose: [{ repotag: 'someone/unknown-thing:1', cpu: 1, ram: 1024, hdd: 10 }] },
    ];
    const { rows } = buildTeamAppRows(specs, 0, TEAM);
    expect(rows[0].category).toBe('other');
  });
});
