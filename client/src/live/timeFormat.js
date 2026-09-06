// Shared relative/absolute time formatting for anything in live/ that shows
// a block's age — relativeTime was previously a private copy inside
// ChainRail; pulled out here so FlowBlock (live/FlowBlock) can use the exact
// same "Xs/Xm ago" phrasing without re-deriving its own.

export function relativeTime(atMs) {
  if (!atMs) return '';
  const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

// Full localized date/time for a block's hover tooltip (spec §64 central
// block hover: "Timestamp: 5 Sep 2026 · 17:03:42").
export function exactTimestamp(atMs) {
  if (!atMs) return '—';
  return new Date(atMs).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
