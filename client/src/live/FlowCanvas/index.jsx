import React, { useRef } from 'react';
import { FlowBlock } from 'live/FlowBlock';
import { ActivityCard } from 'live/ActivityCard';
import { FlowConnectors } from 'live/FlowConnectors';
import { DETAIL_SECTIONS } from 'live/categoryMeta';
import { FluxMark } from 'live/FluxMark';
import './index.scss';

const SECTION_BY_KEY = Object.fromEntries(DETAIL_SECTIONS.map((s) => [s.key, s]));
const QUADRANT_BY_KEY = { reward: 'top-left', deploy: 'top-right', p2p: 'bottom-left', confirm: 'bottom-right' };
const CARD_KEYS = ['reward', 'deploy', 'p2p', 'confirm'];

// Turns a buildBlockFlowSummary() result into the exact per-card
// count/primary/secondary/emptyLabel ActivityCard renders. Kept here (not
// inside ActivityCard) since it's presentation formatting specific to how
// this one canvas lays its four cards out, not a reusable concern.
function cardContentFor(key, summary) {
  switch (key) {
    case 'reward': {
      const { count, totalFlux, tiers } = summary.rewards;
      return {
        count,
        primary: `${totalFlux.toFixed(2)} FLUX`,
        secondary: tiers.map((t) => t.label).join(' · '),
        emptyLabel: 'No rewards paid out yet this block',
      };
    }
    case 'deploy': {
      const { count, apps } = summary.deployments;
      return {
        count,
        primary: apps.map((a) => a.name).join(' · '),
        secondary: null,
        emptyLabel: 'No deployments detected — waiting for network activity',
      };
    }
    case 'p2p': {
      const { count, totalFlux } = summary.p2p;
      return {
        count,
        primary: `${totalFlux.toFixed(4)} FLUX moved`,
        secondary: null,
        emptyLabel: 'No wallet-to-wallet transfers detected in this block',
      };
    }
    case 'confirm': {
      const { count, byTier } = summary.confirmations;
      return {
        count,
        primary: `${count} confirmation${count === 1 ? '' : 's'}`,
        secondary: byTier.map((t) => `${t.count} ${t.label}`).join(' · '),
        emptyLabel: 'No node confirmations seen yet this block',
      };
    }
    default:
      return { count: 0, primary: '', secondary: null, emptyLabel: '' };
  }
}

/*
 * The flow canvas is the hero region of /live (spec §7): a central block
 * connected to four fixed activity nodes by SVG connectors. Owns layout
 * composition only (spec §66) — FlowBlock/ActivityCard/FlowConnectors each
 * own their own presentation.
 */
export function FlowCanvas({ block, summary, expandedCategory = null, onToggleCategory = () => {}, pulseCategories = [], pulseKey = 0 }) {
  const containerRef = useRef(null);
  const blockRef = useRef(null);
  // One stable ref-holding object for the component's lifetime — created
  // once via the outer useRef, not re-created every render, so
  // FlowConnectors' effect (which depends on this object's identity) does
  // not re-run on every unrelated re-render.
  const cardRefs = useRef({
    reward: React.createRef(),
    deploy: React.createRef(),
    p2p: React.createRef(),
    confirm: React.createRef(),
  }).current;

  if (!block || !summary) {
    return (
      <div className="live-flow-canvas live-flow-canvas--loading">
        <FluxMark />
        <span>Loading network activity…</span>
      </div>
    );
  }

  const colors = Object.fromEntries(CARD_KEYS.map((key) => [key, SECTION_BY_KEY[key].color]));

  return (
    <div className="live-flow-canvas" ref={containerRef}>
      <FlowConnectors
        containerRef={containerRef}
        blockRef={blockRef}
        cardRefs={cardRefs}
        colors={colors}
        expandedCategory={expandedCategory}
        pulseCategories={pulseCategories}
        pulseKey={pulseKey}
      />

      {CARD_KEYS.map((key) => {
        const content = cardContentFor(key, summary);
        return (
          <ActivityCard
            key={key}
            ref={cardRefs[key]}
            quadrant={QUADRANT_BY_KEY[key]}
            categoryKey={key}
            def={SECTION_BY_KEY[key]}
            count={content.count}
            primary={content.primary}
            secondary={content.secondary}
            emptyLabel={content.emptyLabel}
            summary={summary}
            isExpanded={expandedCategory === key}
            isDimmed={expandedCategory != null && expandedCategory !== key}
            isPulsing={pulseCategories.includes(key) && pulseKey > 0}
            onToggle={() => onToggleCategory(key)}
          />
        );
      })}

      <FlowBlock
        ref={blockRef}
        block={block}
        summary={summary}
        pulseKey={pulseKey}
        haloColor={expandedCategory ? colors[expandedCategory] : null}
      />
    </div>
  );
}
