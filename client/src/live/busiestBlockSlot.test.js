import { busiestBlockSlotState } from './busiestBlockSlot';

/*
 * Issue #316. The busiest-block card was rendered as `{busiestBlock && ...}`,
 * so when the data was missing the card AND its divider vanished without trace.
 * A reader could not tell "this feature does not exist" from "the API is not
 * being served" from "the scanner has not reached the window yet" -- and the
 * feature was reported as missing for exactly that reason, six days after it
 * shipped.
 *
 * This decides which of those the slot is in. Pure, so the distinction is
 * pinned here rather than in a component.
 */

const BLOCK = { height: 2942000, activity: 31 };

function activity(over = {}) {
  return {
    syncStatus: 'caught_up',
    lastScannedHeight: 2942000,
    scanStartHeight: 0,
    scanTargetHeight: 0,
    busiestBlock: null,
    ...over,
  };
}

describe('busiestBlockSlotState', () => {
  it('shows the block when there is one', () => {
    const state = busiestBlockSlotState(activity({ busiestBlock: BLOCK }));

    expect(state.kind).toBe('block');
    expect(state.block).toBe(BLOCK);
  });

  /*
   * The case this issue was actually reported from: a client-only build serves
   * no /api/v1/*, fetch_chain_activity returns its `empty` object, and the slot
   * silently disappeared. It must now say the API could not be reached, because
   * that is a deployment fact the reader can act on.
   */
  it('reports the API being unreachable, rather than showing nothing', () => {
    const state = busiestBlockSlotState(activity({ syncStatus: 'api_unreachable' }));

    expect(state.kind).toBe('unavailable');
    expect(state.detail).toMatch(/unavailable|unreachable/i);
  });

  it('treats a missing activity object the same as an unreachable API', () => {
    expect(busiestBlockSlotState(null).kind).toBe('unavailable');
    expect(busiestBlockSlotState(undefined).kind).toBe('unavailable');
  });

  it('says the scanner is still catching up, with real progress', () => {
    const state = busiestBlockSlotState(
      activity({
        syncStatus: 'in_progress',
        scanStartHeight: 2919000,
        scanTargetHeight: 2942000,
        lastScannedHeight: 2930500,
      })
    );

    expect(state.kind).toBe('scanning');
    expect(state.progressPct).toBe(50); // 11,500 of 23,000
  });

  it('counts a scan that has never run as still catching up', () => {
    // Not "no busy block" -- there is simply no answer yet. Saying "none in the
    // last 24h" here would be a confident wrong answer on a cold start.
    const state = busiestBlockSlotState(activity({ syncStatus: 'never_run', lastScannedHeight: 0 }));

    expect(state.kind).toBe('scanning');
    expect(state.progressPct).toBe(0);
  });

  it('reports a stalled or explorer-blocked scanner as unavailable, not as empty', () => {
    for (const syncStatus of ['stalled', 'unreachable']) {
      const state = busiestBlockSlotState(activity({ syncStatus }));
      expect(state.kind).toBe('unavailable');
    }
  });

  /*
   * The one case where "nothing to show" is the true answer: the scanner is
   * caught up and genuinely found no qualifying block in the window. Only
   * utility blocks are retained (~17% of blocks), so this is reachable.
   */
  it('says there was no qualifying block only when the scanner is caught up', () => {
    const state = busiestBlockSlotState(activity({ syncStatus: 'caught_up', busiestBlock: null }));

    expect(state.kind).toBe('none');
    expect(state.detail).toMatch(/24h|24 h|last 24/i);
  });

  it('prefers the block over every other state, even mid-scan', () => {
    // A block from the previous cycle is still a true answer while the next
    // scan runs; blanking it would make the slot flicker every cycle.
    const state = busiestBlockSlotState(
      activity({ syncStatus: 'in_progress', busiestBlock: BLOCK })
    );

    expect(state.kind).toBe('block');
  });

  it('always returns a renderable kind and a string detail', () => {
    for (const syncStatus of ['api_unreachable', 'never_run', 'in_progress', 'caught_up', 'stalled', 'unreachable', 'something_new']) {
      const state = busiestBlockSlotState(activity({ syncStatus }));
      expect(['block', 'scanning', 'none', 'unavailable']).toContain(state.kind);
      expect(typeof state.detail).toBe('string');
      expect(state.detail.length).toBeGreaterThan(0);
    }
  });
});
