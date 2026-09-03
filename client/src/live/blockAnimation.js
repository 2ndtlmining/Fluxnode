/*
 * Pure state-transition logic for the "last 5 blocks" list — kept free of
 * timers/DOM/React so the trickiest part (deciding what enters, what leaves,
 * what just slides) is cheap to unit test.
 *
 * The whole list remounts (the caller keys its container on the current tip
 * height) exactly once per genuine new block, which is what makes the CSS
 * keyframe animations below replay — a keyframe animation only plays on
 * mount or when its animation-name changes, never just because a class name
 * persists across an ordinary re-render. A poll that brings no new tip
 * (just refreshed event/tx data for the same blocks) causes no remount and
 * so no animation, which is the desired behaviour.
 *
 * A displayed block carries a `phase`:
 *   'entering' — brand new (or, on first load, all of them at once): fades
 *                and slides in from above
 *   'pushed'   — was already visible, now sliding down one slot because a
 *                new block landed above it — slides only, no fade
 *   'leaving'  — pushed off the bottom of the 5-slot window; still rendered
 *                (at most one at a time) so its dissolve animation can play
 *                before the caller removes it from state
 */

// Merge freshly-fetched (real, newest-first) blocks into the current display
// list, deciding phases. Does not schedule any timers — the caller (Live.jsx)
// removes a 'leaving' block once its dissolve animation has had time to play.
export function mergeIncomingBlocks(prevDisplay, freshBlocks, maxSettled = 5) {
  const freshTop = freshBlocks.slice(0, maxSettled);

  // First load: nothing to push down relative to — everything fades/slides
  // in together, once, rather than a staggered cascade.
  if (prevDisplay.length === 0) {
    return freshTop.map((b) => ({ ...b, phase: 'entering' }));
  }

  const prevSettled = prevDisplay.filter((b) => b.phase !== 'leaving');
  const prevHeights = new Set(prevSettled.map((b) => b.height));
  const isNewTip = freshTop.length > 0 && !prevHeights.has(freshTop[0].height);
  const stillLeaving = prevDisplay.filter((b) => b.phase === 'leaving');

  if (!isNewTip) {
    // Same set of blocks — refresh their data (events may have been
    // backfilled by a later-arriving winner/deploy diff) without touching
    // phase; harmless either way since no remount means no replay.
    const refreshed = freshTop.map((b) => {
      const old = prevSettled.find((p) => p.height === b.height);
      return { ...b, phase: old?.phase || 'entering' };
    });
    return [...refreshed, ...stillLeaving];
  }

  // A genuinely new block landed at the tip — the one at the bottom of the
  // settled window (if any) is about to fall out.
  const outgoing = prevSettled[maxSettled - 1];

  const merged = [
    { ...freshTop[0], phase: 'entering' },
    ...prevSettled.slice(0, maxSettled - 1).map((b) => {
      // Prefer the freshly-fetched version of the same height (keeps its
      // event list current) but it's being pushed down either way.
      const fresh = freshTop.find((f) => f.height === b.height);
      return { ...(fresh || b), phase: 'pushed' };
    }),
  ];

  if (!outgoing) return [...merged, ...stillLeaving];
  return [...merged, { ...outgoing, phase: 'leaving' }, ...stillLeaving];
}

// Call once the leave/dissolve animation's duration has elapsed for a height.
export function removeLeavingBlock(displayBlocks, height) {
  return displayBlocks.filter((b) => !(b.phase === 'leaving' && b.height === height));
}
