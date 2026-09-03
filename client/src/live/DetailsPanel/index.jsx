import React, { useState } from 'react';
import ReactCountryFlag from 'react-country-flag';
import { Lock, Unlock, ChevronDown } from 'lucide-react';
import { DETAIL_SECTIONS } from 'live/categoryMeta';
import { TIER_META } from 'live/tierMeta';
import { lookupNodeInfo } from 'live/apidata';
import { shortImageName, blocksToHumanLong } from 'utils';
import './index.scss';

function truncateAddr(addr) {
  if (!addr) return '—';
  return addr.length > 16 ? `${addr.slice(0, 9)}…${addr.slice(-6)}` : addr;
}

function CountryFlag({ countryCode, country }) {
  return countryCode ? (
    <ReactCountryFlag countryCode={countryCode} svg style={{ width: '1.1em', height: '1.1em' }} title={country} />
  ) : (
    <span className="live-detail-unknown-geo" title="Location unknown">🌐</span>
  );
}

function RewardRow({ event }) {
  const meta = TIER_META[event.tier] || {};
  return (
    <div className="live-detail-row">
      <span className="live-detail-tier" style={{ color: meta.color }}>{meta.label || event.tier}</span>
      <span className="live-detail-amount">{event.amount.toFixed(2)} FLUX</span>
      <span className="live-detail-addr" title={event.paymentAddress}>{truncateAddr(event.paymentAddress)}</span>
      <CountryFlag countryCode={event.countryCode} country={event.country} />
    </div>
  );
}

function P2pRow({ event }) {
  return (
    <div className="live-detail-row">
      <span className="live-detail-addr" title={event.from}>{truncateAddr(event.from)}</span>
      <span className="live-detail-arrow" aria-hidden="true">→</span>
      <span className="live-detail-addr" title={event.to}>{truncateAddr(event.to)}</span>
      <span className="live-detail-amount">{event.amount.toFixed(4)} FLUX</span>
    </div>
  );
}

function DeployRow({ event }) {
  return (
    <div className="live-detail-row live-detail-row--deploy">
      <div className="live-detail-deploy-head">
        <span className="live-detail-appname">{event.appName}</span>
        {event.instances > 1 && <span className="live-detail-badge">{event.instances}×</span>}
        {event.category && <span className="live-detail-category">{event.category}</span>}
      </div>

      {event.description && <div className="live-detail-description">{event.description}</div>}

      {event.repos?.length > 0 && (
        <div className="live-detail-repos">
          {event.repos.map((r) => (
            <span key={r} className="live-detail-repo">{shortImageName(r)}</span>
          ))}
        </div>
      )}

      <div className="live-detail-specs">
        <span>{event.cpuPerInst ?? '—'} vCPU</span>
        <span>{event.ramGBPerInst ?? '—'} GB RAM</span>
        <span>{event.ssdGBPerInst ?? '—'} GB SSD</span>
        {event.expireBlocks && <span>hosted {blocksToHumanLong(event.expireBlocks)}</span>}
        {event.owner && <span className="live-detail-owner" title={event.owner}>by {truncateAddr(event.owner)}</span>}
      </div>
    </div>
  );
}

function ConfirmRow({ event, globalRankings }) {
  const meta = TIER_META[event.tier] || {};
  // Cheap, display-time-only enrichment from data already in memory — see
  // live/apidata.js's lookupNodeInfo for why this never contacts the node.
  const { country, countryCode, benchmark } = lookupNodeInfo(event.ip, event.tier, globalRankings);

  return (
    <div className="live-detail-row live-detail-row--confirm">
      <div className="live-detail-confirm-head">
        <span className="live-detail-tier" style={{ color: meta.color }}>{meta.label || event.tier}</span>
        <span className="live-detail-addr">{event.ip}</span>
        <CountryFlag countryCode={countryCode} country={country} />
      </div>
      {benchmark && (
        <div className="live-detail-specs">
          {benchmark.eps != null && <span>{Math.round(benchmark.eps)} EPS</span>}
          {benchmark.dws != null && <span>{Math.round(benchmark.dws)} DWS</span>}
          {benchmark.down_speed != null && <span>↓{benchmark.down_speed.toFixed(1)} Mb/s</span>}
          {benchmark.up_speed != null && <span>↑{benchmark.up_speed.toFixed(1)} Mb/s</span>}
        </div>
      )}
    </div>
  );
}

const ROW_COMPONENT = { reward: RewardRow, p2p: P2pRow, deploy: DeployRow, confirm: ConfirmRow };

function Section({ def, events, expanded, onToggle, globalRankings }) {
  const Icon = def.Icon;
  const RowComponent = ROW_COMPONENT[def.key];
  const items = (events || []).filter((e) => (def.key === 'reward' ? e.type === 'reward' : e.type === def.key));

  return (
    <div className="live-detail-section">
      <button
        type="button"
        className="live-detail-section-header"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{ '--section-accent': def.color }}
      >
        <span className="live-detail-section-icon" style={{ color: def.color }}>
          <Icon size={14} />
        </span>
        <span className="live-detail-section-label">{def.label}</span>
        <span className="live-detail-section-count">{items.length}</span>
        <ChevronDown size={14} className={`live-detail-chevron${expanded ? ' live-detail-chevron--open' : ''}`} />
      </button>

      {expanded && (
        <div className="live-detail-section-body">
          {items.length === 0 ? (
            <div className="live-detail-empty">{def.emptyLabel || 'None this block'}</div>
          ) : (
            items.map((e) => <RowComponent key={e.id} event={e} globalRankings={globalRankings} />)
          )}
        </div>
      )}
    </div>
  );
}

const ALL_SECTION_KEYS = new Set(DETAIL_SECTIONS.map((s) => s.key));
// Node Confirmations is reliably the noisiest, least-interesting-per-block
// section (see live/apidata.js) — start it collapsed to save vertical space;
// every other section starts open.
const DEFAULT_COLLAPSED_KEYS = new Set(['confirm']);

/*
 * Shows the currently displayed block's activity grouped into four
 * categories. `block` is whichever the caller has decided to display — the
 * live tip by default, a clicked block, or whatever was on screen when the
 * lock button was engaged (see Live.jsx for that state machine); this
 * component just renders it. `globalRankings` feeds the confirmation rows'
 * cheap country/rank enrichment (see live/apidata.js's lookupNodeInfo).
 */
export function DetailsPanel({ block, locked, onToggleLock, globalRankings }) {
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set([...ALL_SECTION_KEYS].filter((k) => !DEFAULT_COLLAPSED_KEYS.has(k)))
  );

  const toggle = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="live-panel live-details-panel">
      <div className="live-panel-header">
        <span className="live-panel-title">BLOCK DETAILS{block ? ` — #${block.height}` : ''}</span>
        <button
          type="button"
          className={`live-lock-btn${locked ? ' live-lock-btn--active' : ''}`}
          onClick={onToggleLock}
          title={locked ? 'Unlock — resume following the latest block' : 'Lock this block so a new one arriving doesn’t change what you’re viewing'}
        >
          {locked ? <Lock size={13} /> : <Unlock size={13} />}
          {locked ? 'Locked' : 'Lock'}
        </button>
      </div>

      {!block ? (
        <div className="live-feed-empty">Loading block details…</div>
      ) : (
        <div className="live-detail-sections">
          {DETAIL_SECTIONS.map((def) => (
            <Section
              key={def.key}
              def={def}
              events={block.events}
              expanded={expandedKeys.has(def.key)}
              onToggle={() => toggle(def.key)}
              globalRankings={globalRankings}
            />
          ))}
        </div>
      )}
    </div>
  );
}
