// client/src/live/liveStatus.js

/*
 * Spec §26: four states, in priority order. "Historical" always wins — it's a
 * deliberate user choice (clicked an older block) and should never be masked
 * by a transient polling hiccup. "Syncing" only applies before the very first
 * successful poll has ever resolved (spec's "Checking network…"); after that,
 * a failed poll streak is "Delayed" (spec's "Retrying automatically"), not a
 * reversion to Syncing — the page has real (if stale) data to keep showing.
 */
export function computeLiveStatus({ isFollowingLive, hasEverLoaded, unavailable }) {
  if (!isFollowingLive) return 'historical';
  if (!hasEverLoaded) return 'syncing';
  if (unavailable) return 'delayed';
  return 'live';
}
