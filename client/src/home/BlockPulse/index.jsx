import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META } from 'live/categoryMeta';
import { useBlockPulse } from './useBlockPulse';
import './index.scss';

/*
 * The chain, assembling itself (issue #292).
 *
 * One square per event in a block, coloured by what the event is, flying in
 * from the edges and settling into a tile grid -- the block being packed.
 * Squares rather than dots on purpose: the thing they assemble into IS a
 * block, and circles would read as confetti.
 *
 * SIZE CARRIES THE COUNT. A typical block (measured: median 13 events, p90 17)
 * gets the largest tile that fits, so the grid GROWS with activity rather than
 * normalising it away -- a busy block is visibly bigger, not merely denser.
 * Tiles shrink only when the count demands it, and only as far as it demands.
 *
 * Colours come from live/categoryMeta.js, the same table /live renders from,
 * so the two surfaces cannot drift on what a colour means.
 */

/*
 * Tiles are sized from the space available, not from a magic threshold.
 *
 * The grid is square-ish, so its height is (columns x (tile + gap)). Solving
 * that for the height budget means a block always fits, and tiles stay as
 * large as they can be -- a typical 14-event block gets the full TILE_MAX and
 * real presence, while a 65-event block shrinks only as far as it must.
 *
 * The first attempt used a fixed 12px with a COMFORTABLE=48 cliff, which made
 * ordinary blocks a 54px smudge in a 537px panel: technically correct, and far
 * too timid for the one thing on Home that is supposed to feel alive.
 */
const GRID_HEIGHT = 104;
const TILE_MAX = 20;
const TILE_MIN = 3;
const GAP = 3;

export function columnsFor(count) {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

export function tileSizeFor(count) {
  if (count <= 0) return TILE_MAX;
  const fits = Math.floor(GRID_HEIGHT / columnsFor(count)) - GAP;
  return Math.max(TILE_MIN, Math.min(TILE_MAX, fits));
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function Tile({ particle, index, size, still }) {
  const meta = CATEGORY_META[particle.category];
  const color = meta?.color || 'var(--text-tertiary)';

  /*
   * Each tile starts somewhere random outside the grid and is translated home.
   * The offset is derived from the particle key rather than Math.random() so a
   * re-render mid-flight does not teleport anything.
   */
  const seed = useMemo(() => {
    let h = 0;
    for (let i = 0; i < particle.key.length; i += 1) h = (h * 31 + particle.key.charCodeAt(i)) | 0;
    const angle = (Math.abs(h) % 360) * (Math.PI / 180);
    const distance = 60 + (Math.abs(h >> 3) % 70);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  }, [particle.key]);

  return (
    <span
      className={`bp-tile${still ? '' : ' bp-tile--flying'}`}
      style={{
        width: size,
        height: size,
        background: color,
        '--bp-from-x': `${seed.x}px`,
        '--bp-from-y': `${seed.y}px`,
        // Staggered so the grid fills rather than snapping into place at once.
        animationDelay: still ? undefined : `${Math.min(index * 14, 520)}ms`,
      }}
    />
  );
}

export function BlockPulse() {
  const { status, height, composition } = useBlockPulse();
  const reduced = prefersReducedMotion();

  // Remount the grid on every new block so the entrance animation replays.
  const [flightKey, setFlightKey] = useState(0);
  const lastHeight = useRef(null);
  useEffect(() => {
    if (height != null && height !== lastHeight.current) {
      lastHeight.current = height;
      setFlightKey((k) => k + 1);
    }
  }, [height]);

  if (status !== 'ready' || !composition) {
    return (
      <div className="bp">
        <div className="bp-grid bp-grid--placeholder" aria-hidden="true" />
        <p className="bp-caption">
          {status === 'error' ? 'Chain activity is unavailable right now.' : 'Reading the chain…'}
        </p>
      </div>
    );
  }

  const { particles, total, counts, capped, hidden } = composition;
  const size = tileSizeFor(particles.length);
  const columns = columnsFor(particles.length);

  /*
   * #330: a category with zero events is omitted rather than shown as
   * "0 transfers". Measured, P2P is zero in most blocks, so a permanent
   * greyed-out row would end up the most visually prominent thing in a panel
   * that is mostly about the other two.
   */
  const legend = [
    {
      key: 'reward',
      count: counts.reward,
      label: counts.reward === 1 ? 'reward' : 'rewards',
      /*
       * Four swatches, not one. A reward particle is always one of four tiers
       * and each is a different colour -- picking any single one to stand for
       * the row would be telling the reader the wrong thing about three of the
       * tiles they can see.
       */
      swatches: ['CUMULUS', 'NIMBUS', 'STRATUS', 'DEVFUND']
        .map((tier) => CATEGORY_META[tier]?.color)
        .filter(Boolean),
    },
    {
      key: 'confirm',
      count: counts.confirm,
      label: counts.confirm === 1 ? 'confirmation' : 'confirmations',
      swatches: [CATEGORY_META.CONFIRM?.color],
    },
    {
      key: 'p2p',
      count: counts.p2p,
      label: counts.p2p === 1 ? 'transfer' : 'transfers',
      swatches: [CATEGORY_META.P2P?.color],
    },
  ].filter((row) => row.count > 0);

  const summary = legend.map((row) => `${row.count} ${row.label}`).join(', ');

  return (
    <div className="bp">
      <div className="bp-body">
        <div
          key={flightKey}
          className="bp-grid"
          style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)`, gap: GAP }}
          role="img"
          aria-label={`Block ${height} contains ${total} events: ${summary}`}
        >
          {particles.map((p, i) => (
            <Tile key={p.key} particle={p} index={i} size={size} still={reduced} />
          ))}
        </div>

        {/*
          The legend is aria-hidden: the grid above already carries the whole
          composition in its aria-label, and repeating it would make a screen
          reader read the block out twice.
        */}
        <dl className="bp-legend" aria-hidden="true">
          {legend.map((row) => (
            <div key={row.key} className="bp-legend-row">
              <dt>
                <span className="bp-legend-swatches">
                  {row.swatches.map((colour) => (
                    <i key={colour} style={{ background: colour }} />
                  ))}
                </span>
                {row.label}
              </dt>
              <dd>{row.count.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="bp-caption">
        Block {height?.toLocaleString()} carried {total.toLocaleString()}{' '}
        {total === 1 ? 'event' : 'events'}
        {capped ? ` — showing ${(total - hidden).toLocaleString()}` : ''}
      </p>
    </div>
  );
}
