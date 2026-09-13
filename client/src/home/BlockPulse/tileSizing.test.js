import { tileSizeFor, columnsFor } from './index';

/*
 * Issue #292. The grid must always fit the space it was given -- that space is
 * the ~157px the reward band was leaving unused, and overflowing it would push
 * the panel taller and undo the reason this lives there at all.
 */
describe('grid sizing', () => {
  const GRID_HEIGHT = 104;
  const GAP = 3;
  const height = (count) => columnsFor(count) * (tileSizeFor(count) + GAP);

  it('gives a typical block a substantial tile', () => {
    // Measured median is 13 events, p90 17. The guarantee is that an ordinary
    // block reads as a real object rather than a smudge -- not an exact size,
    // since the column count steps and 5 columns of 20px would overflow.
    for (const count of [8, 13, 16, 17]) {
      expect(tileSizeFor(count)).toBeGreaterThanOrEqual(17);
      expect(height(count)).toBeLessThanOrEqual(GRID_HEIGHT);
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

  it('keeps the grid square-ish so it reads as a block, not a bar', () => {
    for (const count of [4, 16, 64]) {
      expect(columnsFor(count)).toBe(Math.sqrt(count));
    }
  });

  it('handles an empty block without dividing by zero', () => {
    expect(columnsFor(0)).toBe(1);
    expect(tileSizeFor(0)).toBe(20);
  });
});
