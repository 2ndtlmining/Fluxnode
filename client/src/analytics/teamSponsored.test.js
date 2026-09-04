import { FLUX_TEAM_OWNER_ZELIDS, computeTeamSponsoredShare } from './teamSponsored';

describe('FLUX_TEAM_OWNER_ZELIDS', () => {
  it('includes the known Flux team app-owner ZelID', () => {
    expect(FLUX_TEAM_OWNER_ZELIDS).toContain('196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH');
  });
});

describe('computeTeamSponsoredShare', () => {
  it('computes the team\'s share of network instances', () => {
    const owners = [
      { owner: '196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH', totalInstances: 51 },
      { owner: 'someoneElse', totalInstances: 49 },
    ];
    const result = computeTeamSponsoredShare(owners, 100);
    expect(result).toEqual({ teamInstances: 51, sharePct: 51 });
  });

  it('sums multiple team-owned entries if more than one ZelID is ever in the list', () => {
    const owners = [
      { owner: '196GJWyLxzAw3MirTT7Bqs2iGpUQio29GH', totalInstances: 30 },
      { owner: 'someoneElse', totalInstances: 70 },
    ];
    const result = computeTeamSponsoredShare(owners, 100);
    expect(result.teamInstances).toBe(30);
    expect(result.sharePct).toBe(30);
  });

  it('returns zero share when the team owns nothing in the given list', () => {
    const owners = [{ owner: 'someoneElse', totalInstances: 100 }];
    expect(computeTeamSponsoredShare(owners, 100)).toEqual({ teamInstances: 0, sharePct: 0 });
  });

  it('does not divide by zero when the network total is zero', () => {
    expect(computeTeamSponsoredShare([], 0)).toEqual({ teamInstances: 0, sharePct: 0 });
  });

  it('handles a missing/undefined owners list gracefully', () => {
    expect(() => computeTeamSponsoredShare(undefined, 100)).not.toThrow();
    expect(computeTeamSponsoredShare(undefined, 100)).toEqual({ teamInstances: 0, sharePct: 0 });
  });
});
