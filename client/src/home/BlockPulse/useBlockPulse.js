import { useEffect, useRef, useState } from 'react';
import { fetch_recent_blocks } from 'live/apidata';
import { explorerFetchJson } from 'explorer';
import { composeBlock } from 'live/blockComposition';

/*
 * The block this panel should be drawing (issue #292).
 *
 * ONE BLOCK BEHIND THE TIP, deliberately. A block's transactions are only
 * settled once the chain has moved past it, so animating the tip means
 * animating a block whose contents can still change underneath the animation.
 * Staying one back means the data is final before anything is drawn -- and at
 * a 30-second block time the lag buys the flight its runtime for free.
 *
 * THREE REQUESTS PER BLOCK, typically. /blocks?limit=2 gives height and hash
 * together, so the previous block is identifiable in one call; its
 * transactions are then fetched only when the height has actually changed.
 *
 * The transactions endpoint PAGES AT TEN, which the literal render cannot
 * ignore: block 2,945,979 reported txlength 20 and returned 10, so reading
 * page 0 alone would have drawn half a block and called it whole. Median
 * txlength is 13, so two pages is the normal case. Pages are capped at
 * MAX_PAGES -- past that the block is drawn truncated and says so, which is a
 * better trade than a landing page issuing twenty requests for one freak
 * block. #314 was about exactly this kind of load -- the landing page is the
 * worst place to be casual with the explorer -- so the poll is aligned to the
 * block time rather than run fast, and PAUSES ENTIRELY while the tab is
 * hidden. A backgrounded tab animating nothing has no reason to keep asking.
 */

const POLL_MS = 30_000; // one Flux block
const MAX_PAGES = 3; // 30 transactions; covers the overwhelming majority of blocks

/*
 * Every transaction in a block, following the endpoint's pagination.
 *
 * Deliberately not live/apidata.js's fetch_block_transactions: that reads page
 * 0 only, which is the right call for the chain rail (it wants the coinbase
 * and a handful of events) and the wrong one here, where the whole point is
 * that the count on screen is the real count.
 *
 * Returns null when the first page fails, so the caller can keep showing the
 * last good block rather than blanking.
 */
async function fetchAllBlockTxs(hash) {
  const first = await explorerFetchJson(`/txs/?block=${hash}`);
  if (!first || !Array.isArray(first.txs)) return null;

  const pages = Math.min(Number(first.pagesTotal) || 1, MAX_PAGES);
  const txs = [...first.txs];

  for (let page = 1; page < pages; page += 1) {
    const next = await explorerFetchJson(`/txs/?block=${hash}&pageNum=${page}`);
    // A failed later page is not worth discarding the block over; it is drawn
    // with what arrived and marked truncated.
    if (!next || !Array.isArray(next.txs)) return { txs, truncated: true };
    txs.push(...next.txs);
  }

  return { txs, truncated: (Number(first.pagesTotal) || 1) > MAX_PAGES };
}

export function useBlockPulse({ enabled = true } = {}) {
  const [state, setState] = useState({ status: 'loading', height: null, composition: null });
  const lastHeightRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let timer = null;

    async function tick() {
      // Nothing to animate behind a hidden tab, so do not spend a request on
      // it. The visibilitychange listener below resumes immediately.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      try {
        const blocks = await fetch_recent_blocks(2);
        if (cancelled) return;

        // blocks[0] is the tip; blocks[1] is the one we draw.
        const target = blocks?.[1];
        if (!target?.hash) {
          setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', height: null, composition: null }));
          return;
        }

        // Already drawn. Skip the second request entirely -- this is what keeps
        // the steady state at two calls per block rather than two per poll.
        if (target.height === lastHeightRef.current) return;

        const fetched = await fetchAllBlockTxs(target.hash);
        if (cancelled) return;
        if (!fetched) return; // keep showing the last good block

        lastHeightRef.current = target.height;
        setState({
          status: 'ready',
          height: target.height,
          at: target.at,
          truncated: fetched.truncated,
          composition: composeBlock({ txs: fetched.txs }),
        });
      } catch {
        if (!cancelled) {
          setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', height: null, composition: null }));
        }
      }
    }

    tick();
    timer = setInterval(tick, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return state;
}
