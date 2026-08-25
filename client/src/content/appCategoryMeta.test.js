import { APP_CATEGORY_META, CATEGORY_TOOLTIPS } from './appCategoryMeta';
import { CATEGORIES } from 'main/Gamification/appCategories';

/*
 * The category list, its tooltips and its display metadata live in two files and
 * are easy to drift apart — a category added to appCategories.js with no tooltip
 * renders a raw slug like "infrastructure" in the UI, and a category removed
 * from it leaves dead entries behind. These tests keep the three in lockstep.
 */

// Categories produced by the categorizer that are not keyword-driven.
const SYNTHETIC_CATEGORIES = ['enterprise', 'other'];
const ALL_CATEGORIES = [...Object.keys(CATEGORIES), ...SYNTHETIC_CATEGORIES];

describe('app category metadata', () => {
  it.each(ALL_CATEGORIES)('%s has a tooltip', (category) => {
    expect(typeof CATEGORY_TOOLTIPS[category]).toBe('string');
    expect(CATEGORY_TOOLTIPS[category].length).toBeGreaterThan(0);
  });

  it.each(ALL_CATEGORIES)('%s has label, icon and colour', (category) => {
    const meta = APP_CATEGORY_META[category];
    expect(meta).toBeDefined();
    expect(typeof meta.label).toBe('string');
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.Icon).toBeDefined();
    expect(meta.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('has no tooltips for categories that no longer exist', () => {
    expect(Object.keys(CATEGORY_TOOLTIPS).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('has no metadata for categories that no longer exist', () => {
    expect(Object.keys(APP_CATEGORY_META).sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it('uses the same display label in both files', () => {
    for (const [category, { name }] of Object.entries(CATEGORIES)) {
      expect(APP_CATEGORY_META[category].label).toBe(name);
    }
  });

  it('gives every category a distinct colour', () => {
    const colors = Object.values(APP_CATEGORY_META).map((m) => m.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });
});
