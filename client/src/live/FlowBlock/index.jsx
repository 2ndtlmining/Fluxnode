import React from 'react';
import { FluxMark } from 'live/FluxMark';
import { relativeTime, exactTimestamp } from 'live/timeFormat';
import './index.scss';

/*
 * The central hero of the flow canvas — identifies the event; the four
 * ActivityCards around it explain it (spec §8: "The block identifies the
 * event; the outer nodes explain the event." — deliberately not overloaded
 * with addresses or transaction rows).
 *
 * Live/History status treatment (spec §26-27) and the elaborate new-block
 * glow (spec §9, §24) are out of scope this session — this renders the
 * plain idle state only. `block` is null before the first successful poll;
 * FlowCanvas (Task 7) only mounts this once `block` is real, so the null
 * branch here is a defensive fallback, not the primary loading UI.
 */
export const FlowBlock = React.forwardRef(function FlowBlock({ block, summary }, ref) {
  if (!block || !summary) {
    return (
      <div className="live-flow-block live-flow-block--loading" ref={ref}>
        <FluxMark className="live-flow-block-mark" />
      </div>
    );
  }

  const parts = [];
  if (summary.rewards.count) parts.push(`${summary.rewards.count} reward${summary.rewards.count === 1 ? '' : 's'}`);
  if (summary.deployments.count) parts.push(`${summary.deployments.count} deploy${summary.deployments.count === 1 ? '' : 's'}`);
  if (summary.p2p.count) parts.push(`${summary.p2p.count} transfer${summary.p2p.count === 1 ? '' : 's'}`);
  const activitySummary = parts.length > 0 ? parts.join(' · ') : 'No activity this block';

  return (
    <div
      className="live-flow-block"
      ref={ref}
      title={`Block #${block.height}\nHash: ${block.hash || '—'}\nTimestamp: ${exactTimestamp(block.at)}`}
    >
      <FluxMark className="live-flow-block-mark" />
      <span className="live-flow-block-height">#{block.height}</span>
      <span className="live-flow-block-age">{relativeTime(block.at)}</span>
      <span className="live-flow-block-confirmations">
        {summary.confirmations.count} confirmation{summary.confirmations.count === 1 ? '' : 's'}
      </span>
      <span className="live-flow-block-summary">{activitySummary}</span>
    </div>
  );
});
