import { getPanelAccess, PANEL_ACCESS } from './panelAccess';

describe('getPanelAccess', () => {
  it('always renders when unlocked, regardless of config', () => {
    expect(getPanelAccess('donorTab', true)).toBe(true);
    expect(getPanelAccess('nonexistentKey', true)).toBe(true);
  });

  it('renders a public panel even when locked', () => {
    // No Analytics panel is public any more (#298); an unrelated key still
    // proves the 'public' branch works.
    expect(getPanelAccess('somePublicThing', false)).toBe(false);
    expect(getPanelAccess('topDogs', false)).toBe(false);
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
      // #298: these three rendered with no PanelGate and no entry at all, so a
      // visitor got per-country drill-down free while the map beside them was
      // locked.
      'totalNetwork', 'networkResources', 'hostedApplications',
      // The selector drives those panels; a usable control over locked content
      // is worse than either extreme.
      'networkScope',
      // Previously 'public'. Analytics is a donor feature in full (#298).
      'topDogs', 'expiringToday', 'deployedToday', 'workhorse',
      // Headline strips that also rendered with no gate and no entry.
      'appsKpis', 'networkStatus',
    ];
    for (const key of required) {
      expect(PANEL_ACCESS).toHaveProperty(key);
      expect(PANEL_ACCESS[key]).toBe('donor');
    }
  });

  /*
   * The whole point of #298: Analytics is a donor feature, so nothing in this
   * map may be 'public'. A new panel added as public would fail here rather
   * than quietly giving the tier away.
   */
  it('no Analytics panel is public', () => {
    const publicKeys = Object.entries(PANEL_ACCESS)
      .filter(([, access]) => access !== 'donor')
      .map(([key]) => key);
    expect(publicKeys).toEqual([]);
  });
});
