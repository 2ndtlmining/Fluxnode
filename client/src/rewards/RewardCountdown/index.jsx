import React, { useEffect, useState } from 'react';
import { pad_start } from 'utils';
import { hasScheduledReduction, timeUntilReduction, SECONDS_PER_BLOCK } from 'rewards/rewardReduction';
import './index.scss';

/*
 * Countdown to the next block-reward reduction (issue #240).
 *
 * Deliberately reuses the .timer / .timer-blocks / .timer-block / .v-rule
 * markup from main/PayoutTimer rather than inventing a second clock, so the two
 * read as the same component in two places. Only the accent colour differs --
 * this one is counting down to a cut, not to a payout.
 *
 * The clock ticks locally off a block estimate rather than re-polling the
 * chain: the reduction is weeks away, and the difference between a block-derived
 * estimate and a per-second one is invisible at that distance. It recalculates
 * from `currentBlock` whenever the store refreshes, so it cannot drift far.
 *
 * Renders nothing when no reduction is scheduled (block 0) or once one has
 * landed. An expired countdown showing zeroes would be worse than absent.
 */
export function RewardCountdown({ currentBlock, compact = false }) {
  const [elapsed, setElapsed] = useState(0);

  // Reset the local tick whenever a fresh height arrives, so the estimate is
  // re-anchored to the chain instead of accumulating drift.
  useEffect(() => {
    setElapsed(0);
  }, [currentBlock]);

  useEffect(() => {
    if (!hasScheduledReduction(currentBlock)) return undefined;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [currentBlock]);

  if (!hasScheduledReduction(currentBlock)) return null;

  const base = timeUntilReduction(currentBlock);
  if (!base) return null;

  // Subtract locally-elapsed seconds from the block-derived estimate.
  let remaining = Math.max(0, base.blocks * SECONDS_PER_BLOCK - elapsed);
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;

  return (
    <div className={`timer rwc-timer${compact ? ' rwc-timer--compact' : ''}`}>
      <div className="timer-header">
        <div className="title rwc-title">Next Reward Reduction</div>
      </div>
      <div className="timer-blocks">
        <div className="timer-block">
          <span className="adp-text-normal timer-number">{pad_start(days)}</span>
          <span className="adp-text-normal timer-info">Days</span>
        </div>
        <div className="v-rule"> </div>
        <div className="timer-block">
          <span className="adp-text-normal timer-number">{pad_start(hours)}</span>
          <span className="adp-text-normal timer-info">Hours</span>
        </div>
        <div className="v-rule"> </div>
        <div className="timer-block">
          <span className="adp-text-normal timer-number">{pad_start(minutes)}</span>
          <span className="adp-text-normal timer-info">Minutes</span>
        </div>
        <div className="v-rule"> </div>
        <div className="timer-block">
          <span className="adp-text-normal timer-number">{pad_start(seconds)}</span>
          <span className="adp-text-normal timer-info">Seconds</span>
        </div>
      </div>
      <div className="rwc-caption">
        {base.blocks.toLocaleString()} blocks to go &middot; estimated at the 30-second block
        target, so the real date will drift
      </div>
    </div>
  );
}
