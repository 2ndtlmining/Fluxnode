import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Info } from 'lucide-react';

import { fetch_global_performance_rankings, fetch_global_app_specs } from 'apidata';
import {
  fetch_recent_blocks,
  fetch_block_transactions,
  fetch_block_confirmations,
  extractRewardsFromCoinbase,
  buildRewardEvents,
  buildConfirmationEvents,
  extractP2pTransfers,
  attachEventsToBlocks,
  deployEventsForSlowRefresh,
} from 'live/apidata';
import { mergeIncomingBlocks, removeLeavingBlock } from 'live/blockAnimation';

import { ChainRail } from 'live/ChainRail';
import { DetailsPanel } from 'live/DetailsPanel';

import './Live.scss';

// About half the ~30s block time, so a new block is caught within one poll
// without hammering anything.
const FAST_POLL_MS = 15 * 1000;
// Node geography/rankings change slowly — no need to refresh every poll.
const SLOW_REFRESH_MS = 5 * 60 * 1000;
// How many blocks the rail shows scales with the space available (see the
// ResizeObserver below), between these two bounds.
const MIN_VISIBLE_BLOCK_COUNT = 5;
const MAX_VISIBLE_BLOCK_COUNT = 10;
// Matches ChainRail's own $live-chain-slot-shift (122px block + 28px
// connector) and .live-panel's horizontal padding — kept in sync manually
// since this lives in a different file from the CSS that defines it.
const CHAIN_BLOCK_SLOT_WIDTH = 150;
const CHAIN_PANEL_HORIZONTAL_PADDING = 32;
const LEAVE_ANIMATION_MS = 550;
// A handful of consecutive failed block fetches means "unavailable", not a
// single blip — matches the resilience shape used elsewhere (#144).
const ERROR_STREAK_THRESHOLD = 3;
// Heights older than this many blocks are no longer relevant to anything on
// screen — keeps the accumulator from growing forever in a long session.
const EVENTS_BY_HEIGHT_RETENTION = 30;

export default function Live() {
  const [displayBlocks, setDisplayBlocks] = useState([]);
  // null = follow the live tip; a height = pinned there (by a click, or by
  // the Lock button capturing whatever was showing) until unlocked.
  const [selectedHeight, setSelectedHeight] = useState(null);
  const [unavailable, setUnavailable] = useState(false);
  // Mirrors globalRankingsRef below, purely so the Details panel re-renders
  // when it refreshes — kept as a separate ref too so the poll callbacks
  // that read it don't need it in their dependency arrays (it only changes
  // every 5 minutes, but recreating pollFast would tear down and rebuild the
  // setInterval timers for no reason).
  const [globalRankings, setGlobalRankings] = useState(null);
  // How many blocks the rail shows — grows/shrinks with available width
  // (see the ResizeObserver effect below), bounded to [5, 10].
  const [visibleBlockCount, setVisibleBlockCount] = useState(MIN_VISIBLE_BLOCK_COUNT);
  const chainRailWrapperRef = useRef(null);

  const globalRankingsRef = useRef(null);
  const appSpecsRef = useRef(null);
  const prevTipHeightRef = useRef(null);
  const errorStreakRef = useRef(0);
  const eventsByHeightRef = useRef({});
  const fetchedHeightsRef = useRef(new Set());

  const rememberEvents = useCallback((newEvents) => {
    if (!newEvents || newEvents.length === 0) return;
    const byHeight = eventsByHeightRef.current;
    for (const event of newEvents) {
      const h = event.blockHeight;
      if (h == null) continue;
      if (!byHeight[h]) byHeight[h] = [];
      if (!byHeight[h].some((e) => e.id === event.id)) byHeight[h].push(event);
    }
    // Trim old heights so this doesn't grow unbounded across a long session.
    const heights = Object.keys(byHeight).map(Number).sort((a, b) => b - a);
    for (const h of heights.slice(EVENTS_BY_HEIGHT_RETENTION)) delete byHeight[h];
  }, []);

  const handleSelectBlock = useCallback((block) => setSelectedHeight(block.height), []);

  /*
   * Resolves a block's real activity in two requests per block — only for
   * heights not already resolved, so this is a no-op most polls:
   *   - explorer /api/txs/?block=hash for the coinbase (Node Rewards) and
   *     every other regular transaction (P2P Transfers)
   *   - the official daemon's own verbose getblock for Node Confirmations —
   *     those are a protocol-level special transaction type that both of the
   *     explorer's block endpoints omit entirely (they sit outside the
   *     normal Merkle tree), so only the daemon's raw view actually has them
   */
  const ensureBlockDetailsFetched = useCallback(async (blocks) => {
    const addressGeoMap = globalRankingsRef.current?.addressGeoMap;
    const toFetch = blocks.filter((b) => !fetchedHeightsRef.current.has(b.height));
    if (toFetch.length === 0) return;

    await Promise.all(
      toFetch.map(async (block) => {
        fetchedHeightsRef.current.add(block.height);
        const [{ coinbase, others }, confirmingTxs] = await Promise.all([
          fetch_block_transactions(block.hash),
          fetch_block_confirmations(block.hash),
        ]);
        const rewards = extractRewardsFromCoinbase(coinbase);
        const events = [
          ...buildRewardEvents(block, rewards, addressGeoMap),
          ...buildConfirmationEvents(block, confirmingTxs),
          ...extractP2pTransfers(others),
        ];
        rememberEvents(events);
      })
    );
  }, [rememberEvents]);

  // Node geography/rankings and today's app deployments — both change slowly,
  // refreshed independently of the fast block-watching poll. Uses its own
  // lightweight block-height fetch rather than depending on the fast poll's
  // timing, so this works correctly even before the first fast poll runs.
  const refreshSlowData = useCallback(async () => {
    const [rankings, tipBlocks] = await Promise.all([
      fetch_global_performance_rankings(),
      fetch_recent_blocks(1),
    ]);
    globalRankingsRef.current = rankings;
    setGlobalRankings(rankings);

    const currentHeight = tipBlocks[0]?.height || 0;
    const specs = await fetch_global_app_specs({ fluxBlockHeight: currentHeight });

    // The very first fetch establishes a baseline only — deployedToday covers
    // the last 24h network-wide, so treating that whole backlog as "new" here
    // would flood the current tip with every app deployed all day. Only a
    // genuine delta against a previous poll counts as a fresh event (see
    // deployEventsForSlowRefresh for the null-baseline rule this enforces).
    rememberEvents(deployEventsForSlowRefresh(appSpecsRef.current, specs, currentHeight));
    appSpecsRef.current = specs;
  }, [rememberEvents]);

  // Measures the space actually available to the chain rail (rather than raw
  // window width, which wouldn't account for page padding/max-width) and
  // fits as many block slots as cleanly fit, within [5, 10]. A resize is
  // rare and cheap to react to, so no debouncing — the fetch limit and
  // display window just pick up the new count on their next natural poll
  // rather than an instant reflow, which keeps this simple.
  useEffect(() => {
    const el = chainRailWrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const computeCount = (width) => {
      const usable = Math.max(0, width - CHAIN_PANEL_HORIZONTAL_PADDING);
      const fit = Math.floor(usable / CHAIN_BLOCK_SLOT_WIDTH);
      return Math.min(MAX_VISIBLE_BLOCK_COUNT, Math.max(MIN_VISIBLE_BLOCK_COUNT, fit || MIN_VISIBLE_BLOCK_COUNT));
    };

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setVisibleBlockCount(computeCount(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pollFast = useCallback(async () => {
    // One more than what's shown, so the block about to fall off the end has
    // somewhere to dissolve from.
    const recentBlocks = await fetch_recent_blocks(visibleBlockCount + 1);

    if (recentBlocks.length === 0) {
      errorStreakRef.current += 1;
      if (errorStreakRef.current >= ERROR_STREAK_THRESHOLD) setUnavailable(true);
      return;
    }
    errorStreakRef.current = 0;
    setUnavailable(false);
    prevTipHeightRef.current = recentBlocks[0].height;

    await ensureBlockDetailsFetched(recentBlocks);

    const withEvents = attachEventsToBlocks(recentBlocks, eventsByHeightRef.current);

    setDisplayBlocks((prev) => {
      const next = mergeIncomingBlocks(prev, withEvents, visibleBlockCount);

      const outgoing = next.find((b) => b.phase === 'leaving');
      if (outgoing) {
        setTimeout(() => {
          setDisplayBlocks((cur) => removeLeavingBlock(cur, outgoing.height));
        }, LEAVE_ANIMATION_MS);
      }

      return next;
    });
  }, [ensureBlockDetailsFetched, visibleBlockCount]);

  useEffect(() => {
    let cancelled = false;

    refreshSlowData().then(() => {
      if (!cancelled) pollFast();
    });

    const slowTimer = setInterval(refreshSlowData, SLOW_REFRESH_MS);
    const fastTimer = setInterval(pollFast, FAST_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(slowTimer);
      clearInterval(fastTimer);
    };
  }, [refreshSlowData, pollFast]);

  const tipHeight = displayBlocks.find((b) => b.phase !== 'leaving')?.height ?? null;
  const displayedHeight = selectedHeight ?? tipHeight;
  const displayedBlock = displayBlocks.find((b) => b.height === displayedHeight) || null;
  const locked = selectedHeight != null;

  const handleToggleLock = useCallback(() => {
    setSelectedHeight((prev) => (prev != null ? null : tipHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipHeight]);

  // A block pinned by a click (or the Lock button) that ages out of the
  // 5-slot window entirely has nothing left to show — resume following the
  // tip rather than leaving the panel stuck on "loading" forever.
  useEffect(() => {
    if (selectedHeight != null && !displayBlocks.some((b) => b.height === selectedHeight)) {
      setSelectedHeight(null);
    }
  }, [displayBlocks, selectedHeight]);

  return (
    <div className="live-page">
      <Helmet>
        <title>Live</title>
      </Helmet>

      <div className="live-page-header">
        <span className="live-page-title">
          Live Network Activity
          <span className="live-live-badge">
            <span className="live-live-dot" />
            LIVE
          </span>
        </span>
        <span className="live-page-subtitle">
          The most recent blocks on the chain — click one to inspect its real node reward
          payments, app deployments, transfers and node confirmations below.
        </span>
      </div>

      {unavailable && (
        <div className="live-unavailable">
          <Info size={16} className="live-unavailable-icon" />
          <span>Block data is temporarily unavailable — retrying automatically.</span>
        </div>
      )}

      <div className="live-main-stack">
        <div ref={chainRailWrapperRef}>
          <ChainRail
            blocks={displayBlocks}
            tipHeight={tipHeight}
            selectedHeight={selectedHeight}
            onSelectBlock={handleSelectBlock}
          />
        </div>
        <DetailsPanel
          block={displayedBlock}
          locked={locked}
          onToggleLock={handleToggleLock}
          globalRankings={globalRankings}
        />
      </div>
    </div>
  );
}
