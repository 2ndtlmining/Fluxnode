import React, { useCallback, useEffect, useState } from 'react';
import './index.scss';

/*
 * One SVG overlay, four cubic Bézier connectors — one per activity category
 * — drawn between each ActivityCard's edge (facing the central block) and
 * the block's matching corner. Endpoints are measured from real DOM
 * geometry via refs + ResizeObserver (spec §20-23), never hardcoded per-
 * resolution coordinates, and re-measured only when something's size
 * actually changes — not on every animation frame.
 *
 * Idle rendering plus two visual states layered on top: an expanded card's
 * connector strengthens (opacity/stroke-width), and a category active in
 * the latest block plays a brief traveling pulse (spec §22-25).
 */

const CONNECTOR_ORDER = ['reward', 'deploy', 'p2p', 'confirm'];

// Each connector's control-point "pull" (how far the curve bows away from a
// straight line) is deliberately slightly different per category — an
// identical pull on all four would look mechanically symmetric; slight
// per-category variation reads as a more organic topology (spec §21: "Do
// not make all four curves mathematically identical").
const CONNECTOR_PULL = { reward: 0.42, deploy: 0.38, p2p: 0.46, confirm: 0.4 };

// Anchor point on a rect's edge, biased toward another point's direction —
// approximates "the point on this box's edge closest to the other box"
// without full line/rect intersection math, which is unnecessary precision
// for a decorative connector endpoint.
function anchorTowards(rect, targetCenter) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = targetCenter.x - cx;
  const dy = targetCenter.y - cy;
  const x = cx + Math.sign(dx || 1) * (rect.width / 2) * 0.9;
  const y = cy + Math.sign(dy || 1) * (rect.height / 2) * 0.9;
  return { x, y };
}

function buildPath(from, to, pull) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = Math.max(Math.abs(dx), Math.abs(dy)) * pull;
  const bowSign = dy >= 0 ? 1 : -1;
  const c1x = from.x + dx * 0.35;
  const c1y = from.y + dy * 0.15 + bowSign * bow * 0.3;
  const c2x = from.x + dx * 0.65;
  const c2y = from.y + dy * 0.85 - bowSign * bow * 0.3;
  return `M ${from.x},${from.y} C ${c1x},${c1y} ${c2x},${c2y} ${to.x},${to.y}`;
}

export function FlowConnectors({ containerRef, blockRef, cardRefs, colors, expandedCategory = null, pulseCategories = [], pulseKey = 0 }) {
  const [paths, setPaths] = useState({});

  const measure = useCallback(() => {
    const container = containerRef.current;
    const blockEl = blockRef.current;
    if (!container || !blockEl) return;

    const containerRect = container.getBoundingClientRect();
    const toLocal = (rect) => ({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    });

    const blockRect = toLocal(blockEl.getBoundingClientRect());
    const blockCenter = { x: blockRect.left + blockRect.width / 2, y: blockRect.top + blockRect.height / 2 };

    const next = {};
    for (const key of CONNECTOR_ORDER) {
      const cardEl = cardRefs[key]?.current;
      if (!cardEl) continue;
      const cardRect = toLocal(cardEl.getBoundingClientRect());
      const cardCenter = { x: cardRect.left + cardRect.width / 2, y: cardRect.top + cardRect.height / 2 };

      const fromCard = anchorTowards(cardRect, blockCenter);
      const toBlock = anchorTowards(blockRect, cardCenter);
      next[key] = buildPath(fromCard, toBlock, CONNECTOR_PULL[key]);
    }
    setPaths(next);
  }, [containerRef, blockRef, cardRefs]);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const targets = [blockRef.current, ...Object.values(cardRefs).map((r) => r.current)].filter(Boolean);
    targets.forEach((t) => observer.observe(t));

    return () => observer.disconnect();
  }, [measure, containerRef, blockRef, cardRefs, pulseKey]);

  return (
    <svg className="live-flow-connectors" aria-hidden="true">
      {CONNECTOR_ORDER.map((key) => {
        if (!paths[key]) return null;
        const isExpanded = key === expandedCategory;
        const isPulsing = pulseCategories.includes(key) && pulseKey > 0;
        const classes = [
          'live-flow-connector',
          `live-flow-connector--${key}`,
          isExpanded && 'live-flow-connector--expanded',
        ].filter(Boolean).join(' ');
        return (
          <path
            // Remounts (replaying the pulse keyframe) only when this
            // specific category is both active this block AND pulseKey has
            // advanced — every other poll keeps the same key, so the path
            // updates in place with no replay (spec §25).
            key={isPulsing ? `${key}-pulse-${pulseKey}` : key}
            className={isPulsing ? `${classes} live-flow-connector--pulse` : classes}
            d={paths[key]}
            pathLength="100"
            style={{ '--connector-color': colors?.[key] }}
          />
        );
      })}
    </svg>
  );
}
