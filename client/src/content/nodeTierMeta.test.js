import { NODE_TIER_META, TIER_FALLBACK_COLOR, tierMeta } from './nodeTierMeta';

describe('NODE_TIER_META', () => {
  it('covers every tier the app can render', () => {
    expect(Object.keys(NODE_TIER_META).sort()).toEqual(['CUMULUS', 'FRACTUS', 'NIMBUS', 'STRATUS']);
  });

  it('gives every tier a label and a hex colour', () => {
    for (const [tier, meta] of Object.entries(NODE_TIER_META)) {
      expect(typeof meta.label).toBe('string');
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(meta.label.toUpperCase()).toBe(tier);
    }
  });

  it('gives each tier a distinct colour, so a colour identifies a tier on sight', () => {
    const colors = Object.values(NODE_TIER_META).map((m) => m.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('tierMeta', () => {
  it('resolves a tier name', () => {
    expect(tierMeta('NIMBUS')).toBe(NODE_TIER_META.NIMBUS);
  });

  it('resolves case-insensitively, since feeds disagree on casing', () => {
    expect(tierMeta('nimbus')).toBe(NODE_TIER_META.NIMBUS);
    expect(tierMeta('Nimbus')).toBe(NODE_TIER_META.NIMBUS);
  });

  it('falls back to a neutral entry for an unknown, missing or malformed tier', () => {
    for (const input of ['UNKNOWN', '', null, undefined, 42]) {
      const meta = tierMeta(input);
      expect(meta.color).toBe(TIER_FALLBACK_COLOR);
      expect(typeof meta.label).toBe('string');
    }
  });
});
