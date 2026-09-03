import React from 'react';
import { Box } from 'lucide-react';
import { DETAIL_SECTIONS } from 'live/categoryMeta';
import './index.scss';

function sectionKeyFor(event) {
  return event.type === 'reward' ? 'reward' : event.type; // 'deploy' | 'p2p' | 'confirm'
}

// Small icon+count chips summarizing what's in a block, in the same fixed
// order the Details panel below groups things into.
function sectionCounts(events) {
  const counts = {};
  for (const e of events || []) {
    const key = sectionKeyFor(e);
    counts[key] = (counts[key] || 0) + 1;
  }
  return DETAIL_SECTIONS.filter((s) => counts[s.key] > 0).map((s) => ({ ...s, count: counts[s.key] }));
}

// A light touch, not a data claim: busier blocks get a slightly more "lit
// up" icon so the row reads as busier at a glance, without changing size or
// adding a number anyone would try to read precisely (the chips already do
// that job).
function activityWeightClass(events) {
  const count = events?.length || 0;
  if (count >= 6) return 'live-chain-block-icon--hot';
  if (count >= 3) return 'live-chain-block-icon--busy';
  return '';
}

function relativeTime(atMs) {
  if (!atMs) return '';
  const seconds = Math.max(0, Math.round((Date.now() - atMs) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function ChainBlock({ block, isSelected, onSelect }) {
  const chips = sectionCounts(block.events);
  const activate = () => onSelect(block);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };

  return (
    <div
      className={`live-chain-block live-chain-block--${block.phase}${isSelected ? ' live-chain-block--selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
      title={`Block #${block.height} — click to inspect`}
    >
      <span className={`live-chain-block-icon ${activityWeightClass(block.events)}`}>
        <Box size={18} />
      </span>
      <span className="live-chain-block-height">#{block.height}</span>
      <span className="live-chain-block-time">{relativeTime(block.at)}</span>
      <span className="live-chain-block-chips">
        {chips.length === 0 ? (
          <span className="live-chain-chip live-chain-chip--empty">—</span>
        ) : (
          chips.map(({ key, Icon, color, count }) => (
            <span key={key} className="live-chain-chip" style={{ '--chip-color': color }}>
              <Icon size={10} />
              {count > 1 ? count : ''}
            </span>
          ))
        )}
      </span>
    </div>
  );
}

/*
 * The track is keyed on the current tip height: React remounts it (and every
 * block inside) exactly once per genuine new block, which is what makes each
 * card's CSS keyframe animation replay — a keyframe only plays on mount,
 * never just because a className persists across an ordinary re-render. A
 * poll that changes no heights (just refreshes chip data) updates in place
 * with no remount and so no animation, which is correct. See
 * live/blockAnimation.js for the phase state machine this renders.
 */
export function ChainRail({ blocks, tipHeight, selectedHeight, onSelectBlock }) {
  return (
    <div className="live-panel live-chain-rail">
      <div className="live-panel-header">
        <span className="live-panel-title">BLOCKCHAIN</span>
        <span className="live-chain-hint">click a block to inspect it below</span>
      </div>

      <div className="live-chain-track" key={tipHeight ?? 'loading'}>
        {blocks.length === 0 ? (
          <div className="live-feed-empty">Loading recent blocks…</div>
        ) : (
          blocks.map((block, i) => (
            <React.Fragment key={block.height}>
              <ChainBlock
                block={block}
                isSelected={selectedHeight == null ? i === 0 : selectedHeight === block.height}
                onSelect={onSelectBlock}
              />
              {i < blocks.length - 1 && <span className="live-chain-connector" aria-hidden="true" />}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
