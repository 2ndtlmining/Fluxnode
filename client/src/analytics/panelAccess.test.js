import { getPanelAccess, PANEL_ACCESS, isWalletScoped } from './panelAccess';

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
    // #325 made these 'donor-own': donor-gated AND scoped to the wallet being
    // viewed. The guarantee this test exists for is unchanged -- neither may
    // become 'public' -- and the unlock assertion is now stricter, not looser.
    const OWN = 't1TheDonorsOwnWallet';
    for (const key of ['nodesAchievements', 'nodesApps']) {
      expect(PANEL_ACCESS).toHaveProperty(key);
      expect(PANEL_ACCESS[key]).toBe('donor-own');
      expect(getPanelAccess(key, false)).toBe(false);
      expect(getPanelAccess(key, true, { donorWallet: OWN, viewedWallet: OWN })).toBe(true);
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
      .filter(([, access]) => access === 'public')
      .map(([key]) => key);
    expect(publicKeys).toEqual([]);
  });

  /*
   * The check above used to read `access !== 'donor'`, which caught a typo'd
   * level for free. #325 added a second legitimate level, so that form would
   * now reject a correct value -- this keeps the typo-catching separately
   * rather than losing it.
   */
  it('every entry uses a known access level', () => {
    const unknown = Object.entries(PANEL_ACCESS)
      .filter(([, access]) => !['public', 'donor', 'donor-own'].includes(access))
      .map(([key, access]) => `${key}: ${access}`);
    expect(unknown).toEqual([]);
  });
});

/*
 * Issue #325 -- a borrowed donor address unlocked premium permanently, for any
 * wallet.
 *
 * Donor unlock lives in localStorage and nothing ever clears it:
 * setDonorWallet is never called with null anywhere in the app, and
 * runDonorAutoDetect only calls it on SUCCESS -- so searching a wallet that
 * does not qualify is silent and leaves the previous unlock in place. Enter a
 * known donor address once, then browse your own wallet forever, still
 * unlocked.
 *
 * The wallet-scoped panels now require the wallet you are VIEWING to be the
 * verified donor wallet, which is what makes the borrow useless: it unlocks
 * the donor's own view, not yours.
 */
describe('getPanelAccess — wallet-scoped panels (#325)', () => {
  const OWNER = 't1DonorWalletAddress';
  const SOMEONE_ELSE = 't1SomebodyElsesWallet';

  it('unlocks a wallet-scoped panel when viewing the donor wallet itself', () => {
    expect(
      getPanelAccess('nodesAchievements', true, { donorWallet: OWNER, viewedWallet: OWNER })
    ).toBe(true);
  });

  it('LOCKS a wallet-scoped panel when viewing someone else, even while unlocked', () => {
    // The borrowed-address case: isUnlocked is true, and it still must not
    // open somebody else's data.
    expect(
      getPanelAccess('nodesAchievements', true, { donorWallet: OWNER, viewedWallet: SOMEONE_ELSE })
    ).toBe(false);
    expect(
      getPanelAccess('nodesApps', true, { donorWallet: OWNER, viewedWallet: SOMEONE_ELSE })
    ).toBe(false);
  });

  it('ignores case and surrounding whitespace when comparing the two', () => {
    expect(
      getPanelAccess('nodesAchievements', true, {
        donorWallet: `  ${OWNER.toUpperCase()}  `,
        viewedWallet: OWNER,
      })
    ).toBe(true);
  });

  it('locks a wallet-scoped panel when no wallet is being viewed', () => {
    for (const viewedWallet of [null, undefined, '']) {
      expect(
        getPanelAccess('nodesAchievements', true, { donorWallet: OWNER, viewedWallet })
      ).toBe(false);
    }
  });

  it('still locks a wallet-scoped panel for a non-donor viewing their own wallet', () => {
    expect(
      getPanelAccess('nodesAchievements', false, { donorWallet: null, viewedWallet: SOMEONE_ELSE })
    ).toBe(false);
  });

  /*
   * The TESTING override has to keep working end to end, or local QA of these
   * panels becomes impossible -- it is the only way to see them without a real
   * donation now that the demo is gone (#324).
   */
  it('leaves the network-scoped panels alone', () => {
    // /analytics and /live have no wallet in view to tie to, so they keep
    // today's behaviour. Deliberate, and recorded in #325.
    expect(getPanelAccess('appEcosystem', true, { donorWallet: OWNER, viewedWallet: SOMEONE_ELSE })).toBe(true);
    expect(getPanelAccess('appEcosystem', false, { donorWallet: OWNER, viewedWallet: OWNER })).toBe(false);
  });

  it('behaves as before when no wallet context is supplied at all', () => {
    // Every existing caller passes two arguments; they must not change meaning.
    expect(getPanelAccess('appEcosystem', true)).toBe(true);
    expect(getPanelAccess('appEcosystem', false)).toBe(false);
  });
});

describe('isWalletScoped (#325)', () => {
  it('is true only for the panels whose content belongs to one wallet', () => {
    expect(isWalletScoped('nodesAchievements')).toBe(true);
    expect(isWalletScoped('nodesApps')).toBe(true);
  });

  it('is false for network-scoped panels and unknown keys', () => {
    expect(isWalletScoped('appEcosystem')).toBe(false);
    expect(isWalletScoped('worldMap')).toBe(false);
    expect(isWalletScoped('nothingCalledThis')).toBe(false);
  });
});
