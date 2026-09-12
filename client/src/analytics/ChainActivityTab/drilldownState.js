/*
 * The two decisions that kept the block drill-down stuck (issue #253).
 *
 * Pulled out of the effect because effect-cleanup behaviour is exactly the kind
 * of thing that is invisible in review and untestable in place: the bug below
 * only appears if you close the panel during the window where its fetch is
 * still in flight.
 */

/** Fetch once, on open. Never while closed, never on top of a result. */
export function shouldFetchDrilldown(open, status) {
  return open && status === 'idle';
}

/*
 * What the state should become when an in-flight load is cancelled -- which is
 * what the effect cleanup does when the panel closes.
 *
 * Returning to 'idle' is the fix. Previously the status stayed 'loading': the
 * late resolve was discarded because `cancelled` was set, and
 * shouldFetchDrilldown then refused every subsequent attempt, so the panel
 * showed "Loading blocks..." forever with no request behind it.
 *
 * A finished load (ready/error) is returned unchanged -- and by identity, so
 * React bails out of the re-render rather than looping.
 */
export function stateAfterCancel(state) {
  return state?.status === 'loading' ? { status: 'idle', data: null } : state;
}
