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
 * Live/History status treatment (spec §26-27) is out of scope this session;
 * the new-block pulse and expanded-category halo (spec §9, §24) ARE
 * implemented here via the `pulseKey`/`haloColor` props. `block` is null
 * before the first successful poll;
 * FlowCanvas (Task 7) only mounts this once `block` is real, so the null
 * branch here is a defensive fallback, not the primary loading UI.
 */
export const FlowBlock = React.forwardRef(function FlowBlock({ block, summary, pulseKey = 0, haloColor = null }, ref) {
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
      className={[
        'live-flow-block',
        pulseKey > 0 && 'live-flow-block--pulse',
        haloColor && 'live-flow-block--halo',
      ].filter(Boolean).join(' ')}
      ref={ref}
      key={pulseKey > 0 ? `pulse-${pulseKey}` : 'idle'}
      style={haloColor ? { '--flow-block-halo': haloColor } : undefined}
      title={[
        `Block #${block.height}`,
        `Hash: ${block.hash || '—'}`,
        `Timestamp: ${exactTimestamp(block.at)}`,
        `Rewards: ${summary.rewards.count}`,
        `P2P: ${summary.p2p.count}`,
        `Deployments: ${summary.deployments.count}`,
        `Confirmations: ${summary.confirmations.count}`,
      ].join('\n')}
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
