import React from 'react';
import { ChevronRight } from 'lucide-react';
import './index.scss';

/*
 * One of the four fixed activity nodes around the central block. Real
 * interactive element (spec §51: Tab/Enter/Space/Escape, visible focus) —
 * mirrors ChainRail's ChainBlock role="button"/tabIndex/onKeyDown pattern
 * for consistency with the only other clickable list-item in this page.
 * Escape and click-outside collapse are handled by the caller (Live.jsx /
 * FlowCanvas), not here — this component only owns "clicking *this* card".
 *
 * Expanded content itself (the per-category rows) is supplied by the caller
 * as `expandedBody` — FlowCanvas's cardContentFor (Task 5) builds it from
 * buildBlockFlowSummary's data. This component owns only the chrome: the
 * quadrant-outward growth, dim/highlight states, and the click/keyboard
 * plumbing (spec §66: "ActivityCard: Owns category summary and expansion
 * presentation").
 */
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, def, count, primary, secondary, emptyLabel, isExpanded, isDimmed, isPulsing, onToggle = () => {}, expandedBody },
  ref
) {
  const Icon = def.Icon;
  const isEmpty = !count;

  // `onToggle` defaults to a no-op above: FlowCanvas doesn't actually wire a
  // real handler into this prop until Task 5 (and Live.jsx doesn't own real
  // expandedCategory state until Task 9) — without this default, clicking a
  // card between this task and Task 5 landing would throw ("onToggle is not
  // a function") rather than just harmlessly doing nothing yet.
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleClick = (e) => {
    // Stops this from also bubbling to FlowCanvas's click-outside-collapses
    // handler (spec §12: "Clicking empty canvas collapses" — a card click is
    // never "empty canvas").
    e.stopPropagation();
    onToggle();
  };

  const classes = [
    'live-flow-card',
    `live-flow-card--${quadrant}`,
    isEmpty && 'live-flow-card--empty',
    isExpanded && 'live-flow-card--expanded',
    isDimmed && 'live-flow-card--dimmed',
    isPulsing && 'live-flow-card--pulse',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      ref={ref}
      style={{ '--card-accent': def.color }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${def.label}, ${count} — ${isExpanded ? 'expanded, activate to collapse' : 'activate to expand'}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="live-flow-card-header">
        <span className="live-flow-card-icon">
          <Icon size={15} />
        </span>
        <span className="live-flow-card-label">{def.label}</span>
        <span className="live-flow-card-count">{count}</span>
      </div>

      {isExpanded ? (
        <div className="live-flow-card-expanded-body">{expandedBody}</div>
      ) : isEmpty ? (
        <div className="live-flow-card-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="live-flow-card-primary">{primary}</div>
          {secondary && <div className="live-flow-card-secondary">{secondary}</div>}
        </>
      )}

      <ChevronRight
        size={14}
        className={`live-flow-card-chevron${isExpanded ? ' live-flow-card-chevron--open' : ''}`}
        aria-hidden="true"
      />
    </div>
  );
});
