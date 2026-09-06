import React from 'react';
import { ChevronRight } from 'lucide-react';
import './index.scss';

/*
 * One of the four fixed activity nodes around the central block. Static/
 * inert this session — real data, real empty state, but no click-to-expand
 * yet (Session B, spec §12-14). The chevron is a forward-looking
 * affordance only; no handler is wired up here, and the card is not (yet)
 * a real interactive element (no role/tabIndex) — that lands in Session B
 * alongside the click behavior itself (spec §51: cards become real
 * interactive elements when they become clickable).
 */
export const ActivityCard = React.forwardRef(function ActivityCard(
  { quadrant, def, count, primary, secondary, emptyLabel },
  ref
) {
  const Icon = def.Icon;
  const isEmpty = !count;

  return (
    <div
      className={`live-flow-card live-flow-card--${quadrant}${isEmpty ? ' live-flow-card--empty' : ''}`}
      ref={ref}
      style={{ '--card-accent': def.color }}
    >
      <div className="live-flow-card-header">
        <span className="live-flow-card-icon">
          <Icon size={15} />
        </span>
        <span className="live-flow-card-label">{def.label}</span>
        <span className="live-flow-card-count">{count}</span>
      </div>

      {isEmpty ? (
        <div className="live-flow-card-empty">{emptyLabel}</div>
      ) : (
        <>
          <div className="live-flow-card-primary">{primary}</div>
          {secondary && <div className="live-flow-card-secondary">{secondary}</div>}
        </>
      )}

      <ChevronRight size={14} className="live-flow-card-chevron" aria-hidden="true" />
    </div>
  );
});
