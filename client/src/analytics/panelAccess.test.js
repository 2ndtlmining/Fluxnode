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

  it('every currently-rendered Analytics panel has an explicit entry', () => {
    const required = [
      'appsTeamSponsoredStat', 'appEcosystem', 'topHostedApps',
      'topNodeOperators', 'topAppOwners', 'worldMap', 'continentBreakdown',
      'donorTab', 'chainActivity',
    ];
    for (const key of required) expect(PANEL_ACCESS).toHaveProperty(key);
  });
});
