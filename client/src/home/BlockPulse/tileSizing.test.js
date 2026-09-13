import { tileSizeFor, columnsFor, GRID_HEIGHT, TILE_MAX } from './index';

/*
 * Issue #292, resized in #354. The grid must always fit the space it was
 * given, and overflowing it would push the panel taller and undo the reason
 * this lives there at all.
 *
 * THE SPACE GOT MUCH BIGGER. #292 sized this against ~157px measured at a
 * 1386px viewport, before the donation list landed beside it. Measured again
 * for #354: the reward band is now 496px tall and 751px wide, and its content
 * -- timer 125, delta 19, pulse 120 -- is 264px. 232px, 47% of the panel, was
 * empty, which is what the report is about.
 *
 * The budget below is what fits without growing the row: at GRID_HEIGHT the
 * band's content reaches ~412px against the 496px the support panel beside it
 * already sets, so the pulse takes the slack instead of adding height.
 */
describe('grid sizing', () => {
  const GAP = 3;
  const height = (count) => columnsFor(count) * (tileSizeFor(count) + GAP);

  it('gives a typical block a substantial tile', () => {
    // Measured median is 13 events, p90 17. The guarantee is that an ordinary
    // block reads as a real object rather than a smudge -- not an exact size,
    // since the column count steps.
    for (const count of [8, 13, 16, 17]) {
      expect(tileSizeFor(count)).toBeGreaterThanOrEqual(28);
      expect(height(count)).toBeLessThanOrEqual(GRID_HEIGHT);
    }
  });

  /*
   * The point of #354. A typical block used to draw a ~100px grid in a panel
   * with 232px going spare; it should now be a good deal larger without
   * overflowing.
   */
  it('uses the space the panel actually has', () => {
    for (const count of [13, 17, 20]) {
      expect(height(count)).toBeGreaterThan(120);
    }
  });

  it('shrinks tiles rather than overflowing, as a block gets busier', () => {
    // p99 is 65; 214 was the largest in 200 blocks.
    for (const count of [25, 48, 65, 120, 214]) {
      expect(height(count)).toBeLessThanOrEqual(GRID_HEIGHT);
    }
  });

  it('never shrinks a tile to nothing', () => {
    expect(tileSizeFor(500)).toBeGreaterThanOrEqual(3);
  });

  it('caps a sparse block rather than drawing one enormous tile', () => {
    // A 1-event block must not render as a single GRID_HEIGHT-sized square.
    expect(tileSizeFor(1)).toBe(TILE_MAX);
    expect(tileSizeFor(4)).toBeLessThanOrEqual(TILE_MAX);
  });

  it('keeps the grid square-ish so it reads as a block, not a bar', () => {
    for (const count of [4, 16, 64]) {
      expect(columnsFor(count)).toBe(Math.sqrt(count));
    }
  });

  it('handles an empty block without dividing by zero', () => {
    expect(columnsFor(0)).toBe(1);
    expect(tileSizeFor(0)).toBe(TILE_MAX);
  });
});
