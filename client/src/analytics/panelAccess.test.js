import { getPanelAccess, PANEL_ACCESS } from './panelAccess';

describe('getPanelAccess', () => {
  it('always renders when unlocked, regardless of config', () => {
    expect(getPanelAccess('donorTab', true)).toBe(true);
    expect(getPanelAccess('nonexistentKey', true)).toBe(true);
  });

  it('renders a public panel even when locked', () => {
    expect(getPanelAccess('topDogs', false)).toBe(true);
  });

  it('does not render a donor panel when locked', () => {
    expect(getPanelAccess('appEcosystem', false)).toBe(false);
  });

  it('treats an unknown key as locked-by-default when not unlocked', () => {
    expect(getPanelAccess('somethingNotInTheConfig', false)).toBe(false);
  });

  it('the /nodes achievement and app tabs are donor-gated', () => {
    // These gate a searched wallet's own achievements and app breakdown behind
    // the donation threshold, blurred rather than hidden so a visitor can see
    // the feature exists. Pinned here because silently flipping either to
    // 'public' would give away the premium tier with no other test failing.
    for (const key of ['nodesAchievements', 'nodesApps']) {
      expect(PANEL_ACCESS).toHaveProperty(key);
      expect(PANEL_ACCESS[key]).toBe('donor');
      expect(getPanelAccess(key, false)).toBe(false);
      expect(getPanelAccess(key, true)).toBe(true);
    }
  });

  it('every currently-rendered Analytics panel has an explicit entry', () => {
    const required = [
      'appsTeamSponsoredStat', 'appEcosystem', 'topHostedApps',
      'topNodeOperators', 'topAppOwners', 'worldMap',
      'donorTab', 'chainActivity',
    ];
    for (const key of required) {
      expect(PANEL_ACCESS).toHaveProperty(key);
      expect(PANEL_ACCESS[key]).toBe('donor');
    }
  });
});
