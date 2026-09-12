import { scanProgressPct } from 'analytics/chainActivity';

/*
 * What the busiest-block slot on the live rail should be showing (issue #316).
 *
 * The card from #286 was rendered as `{busiestBlock && ...}`, so a missing
 * block took the card and its divider off the page entirely. That made four
 * very different situations look identical -- and identical to the feature not
 * existing at all, which is how it came to be reported as missing six days
 * after it shipped:
 *
 *   - the API is not being served (a client-only build has no /api/v1/*)
 *   - the scanner has not reached the window yet (a cold start is ~23,040
 *     blocks and takes minutes)
 *   - the scanner is stalled, or cannot reach the block explorer
 *   - there genuinely was no qualifying block in the last 24 hours
 *
 * Only the last of those is "nothing to show". The other three are things the
 * reader can act on, and the slot should say which.
 *
 * Kept pure and out of the component so the distinction is testable without
 * rendering — the same reason chainActivity.js keeps scanProgressPct separate.
 */

const UNAVAILABLE = new Set([
  // We never reached our own API.
  'api_unreachable',
  // We reached it; the scanner itself is not producing answers.
  'stalled',
  'unreachable',
]);

const SCANNING = new Set(['never_run', 'in_progress']);

/**
 * @returns {{ kind: 'block'|'scanning'|'none'|'unavailable', block?, progressPct?, detail: string }}
 */
export function busiestBlockSlotState(activity) {
  /*
   * A block wins over every other state, including mid-scan. The block from the
   * previous cycle is still a true answer while the next scan runs, and
   * blanking it would make the slot flicker on every refresh.
   */
  if (activity?.busiestBlock) {
    return {
      kind: 'block',
      block: activity.busiestBlock,
      detail: 'Busiest block of the last 24 hours',
    };
  }

  // No activity object at all is the same fact as an unreachable API: the
  // fetch failed, and fetch_chain_activity's own `empty` says as much.
  const syncStatus = activity?.syncStatus ?? 'api_unreachable';

  if (UNAVAILABLE.has(syncStatus)) {
    return {
      kind: 'unavailable',
      detail:
        syncStatus === 'api_unreachable'
          ? 'Chain activity is unavailable — this build is not serving the chain-activity API.'
          : 'The chain scanner is not currently producing results.',
    };
  }

  if (SCANNING.has(syncStatus)) {
    const progressPct = scanProgressPct(activity || {});
    return {
      kind: 'scanning',
      progressPct,
      detail: `Chain scanner is still catching up (${progressPct}%). The busiest block appears once it reaches the last 24 hours.`,
    };
  }

  if (syncStatus === 'caught_up') {
    return {
      kind: 'none',
      detail: 'No qualifying block in the last 24h.',
    };
  }

  /*
   * An outcome this frontend has not been taught about. Treated as unavailable
   * rather than as "none": claiming the chain was quiet on the strength of a
   * status we do not recognise would be the same confident-wrong-answer
   * failure this whole module exists to remove.
   */
  return {
    kind: 'unavailable',
    detail: 'Chain activity status is unrecognised.',
  };
}
