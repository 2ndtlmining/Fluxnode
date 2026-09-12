import { DEDICATED_SITE_PREFIXES, categorizeDedicatedSiteApp } from './dedicatedSites';

describe('DEDICATED_SITE_PREFIXES', () => {
  it('covers every game RunOnFlux/fluxview lists as a dedicated hosting site', () => {
    for (const prefix of [
      'palworld',
      'minecraftj', 'minecraftb', 'minecraftserver', 'minecraftbedrockserver',
      'projectzomboid', 'windrose', 'enshrouded',
      'rustserver', 'rustserveroxide',
      'fivem', 'valheim', 'terraria', 'dragonwilds',
    ]) {
      expect(DEDICATED_SITE_PREFIXES[prefix]).toBe('gaming');
    }
  });

  it('has no prefix that is only reachable through a longer one', () => {
    // rustserver / rustserveroxide overlap by design. That is safe ONLY because
    // matching anchors on the timestamp -- if a prefix were ever added that a
    // longer prefix fully shadowed WITHOUT the anchor saving it, the shorter
    // one would silently win. Pin the property rather than the two names.
    for (const [prefix, category] of Object.entries(DEDICATED_SITE_PREFIXES)) {
      const shadowed = Object.keys(DEDICATED_SITE_PREFIXES)
        .filter((other) => other !== prefix && other.startsWith(prefix))
        .filter((other) => DEDICATED_SITE_PREFIXES[other] !== category);
      expect(shadowed).toEqual([]);
    }
  });
});

describe('categorizeDedicatedSiteApp', () => {
  it('categorizes an app deployed through a dedicated site', () => {
    expect(categorizeDedicatedSiteApp('dragonwilds1789155733040')).toBe('gaming');
    expect(categorizeDedicatedSiteApp('valheim1787327994881')).toBe('gaming');
  });

  it('requires the timestamp, so a hand-named app is not swept up', () => {
    // Real on-network names: "palworld16slots" is somebody's own app, not a
    // deployment from the Palworld site.
    expect(categorizeDedicatedSiteApp('palworld16slots')).toBeNull();
    expect(categorizeDedicatedSiteApp('palworld')).toBeNull();
    expect(categorizeDedicatedSiteApp('valheimserver')).toBeNull();
  });

  it('does not match a timestamp shorter than 13 digits', () => {
    expect(categorizeDedicatedSiteApp('valheim1234567890123')).toBe('gaming'); // 13 digits
    expect(categorizeDedicatedSiteApp('valheim123456789012')).toBeNull(); // 12 digits
    expect(categorizeDedicatedSiteApp('valheim123456')).toBeNull(); // 6 digits
  });

  it('picks the right entry when one prefix is a prefix of another', () => {
    // Both are real: rustserveroxide must not be read as rustserver + junk.
    expect(categorizeDedicatedSiteApp('rustserveroxide1787227589902')).toBe('gaming');
    expect(categorizeDedicatedSiteApp('rustserver1787327994881')).toBe('gaming');
  });

  /*
   * fluxview matches these prefixes CASE SENSITIVELY on purpose: the sites
   * always write lowercase, while the same app deployed straight from the Flux
   * marketplace keeps its original casing, and that is how fluxview tells the
   * two apart. We deliberately do not care -- a Valheim server is Gaming
   * however it was deployed -- so this matches either casing.
   */
  it('matches regardless of casing, unlike fluxview', () => {
    expect(categorizeDedicatedSiteApp('Valheim1787327994881')).toBe('gaming');
    expect(categorizeDedicatedSiteApp('DRAGONWILDS1789155733040')).toBe('gaming');
  });

  it('returns null for an unrelated name, so the caller can fall through', () => {
    expect(categorizeDedicatedSiteApp('FoldingAtRunOnFlux13')).toBeNull();
    expect(categorizeDedicatedSiteApp('')).toBeNull();
    expect(categorizeDedicatedSiteApp(null)).toBeNull();
    expect(categorizeDedicatedSiteApp(undefined)).toBeNull();
  });
});
