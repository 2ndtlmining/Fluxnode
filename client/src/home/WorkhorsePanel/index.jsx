import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './index.scss';

import { Tooltip2 } from '@blueprintjs/popover2';
import { FiCpu, FiHardDrive, FiDownload, FiUpload, FiBox } from 'react-icons/fi';

import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { categorizeApp, isOpaqueRuntimeImage } from 'main/Gamification/appCategories';
import { buildSpecIndex } from 'appSpecs';

const ROTATE_MS = 8000;

const TIER_COLOR = {
  CUMULUS: '#2686d0',
  NIMBUS: '#d07e26',
  STRATUS: '#c92641'
};

/*
 * Utilisation is the whole point of the card, so the bar carries the reading
 * rather than just measuring it: comfortable, busy, or nearly full.
 */
function pressureColor(pct) {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return '#10b981';
}

/** Matches the Expiring / Deployed panels: unknown reads as an em dash, not 0.00. */
function fmtSpec(value, suffix) {
  if (value == null) return '—';
  return `${value.toFixed(2)}${suffix}`;
}

function fmt(n, decimals = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function UtilBar({ label, used, total, unit, decimals = 0 }) {
  const known = used != null && total != null && total > 0;
  const pct = known ? Math.min(100, (used / total) * 100) : 0;

  return (
    <div className="whp-util">
      <span className="whp-util__label">{label}</span>
      <div className="whp-util__track">
        <div
          className="whp-util__fill"
          style={{ width: `${pct}%`, background: pressureColor(pct) }}
        />
      </div>
      <span className="whp-util__value">
        {known ? `${fmt(used, decimals)} / ${fmt(total, decimals)}${unit}` : '—'}
      </span>
      <span className="whp-util__pct">{known ? `${Math.round(pct)}%` : ''}</span>
    </div>
  );
}

function Stat({ Icon, label, value }) {
  return (
    <div className="whp-stat">
      <span className="whp-stat__icon"><Icon size={11} /></span>
      <span className="whp-stat__label">{label}</span>
      <span className="whp-stat__value">{value}</span>
    </div>
  );
}

function NodeCard({ node, specsByName }) {
  /*
   * Deployed apps, joined to the global app specs so each row can carry the
   * same category / instances / CPU / RAM / SSD as the Deployed Today panel.
   * A node runs one container per component, so several containers can belong
   * to one app — the count here is components, and the header counts containers.
   */
  const apps = useMemo(() => {
    const counts = {};
    for (const name of node.appNames || []) {
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, components]) => ({ name, components, spec: specsByName?.[name] || null }))
      .sort((a, b) => b.components - a.components || a.name.localeCompare(b.name));
  }, [node.appNames, specsByName]);

  const categories = useMemo(() => {
    const counts = {};
    for (const image of node.images || []) {
      const cat = isOpaqueRuntimeImage(image) ? 'other' : categorizeApp(image.toLowerCase());
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [node.images]);

  const tierColor = TIER_COLOR[node.tier] || 'var(--text-tertiary)';
  const b = node.benchmark;

  return (
    <div className="whp-card">
      <div className="whp-col whp-col--identity">
        {node.paymentAddress ? (
          <Tooltip2
            content="Open this node's wallet"
            placement="top"
            hoverOpenDelay={250}
            popoverClassName="hov-cat-tooltip"
          >
            <a className="whp-ip whp-ip--link" href={`#/nodes?wallet=${node.paymentAddress}`}>
              {node.ip}
            </a>
          </Tooltip2>
        ) : (
          <div className="whp-ip">{node.ip}</div>
        )}

        <div className="whp-meta">
          <span className="whp-tier" style={{ color: tierColor, borderColor: `${tierColor}55` }}>
            {node.tier || 'UNKNOWN'}
          </span>
          {node.country && (
            <span className="whp-country">{node.country}</span>
          )}
        </div>

        {b ? (
          <div className="whp-stats">
            {/* EPS is a benchmark score and carries no unit anywhere in the
                app; DWS is MB/s, matching the node table's column help. */}
            <Stat Icon={FiCpu} label="EPS" value={fmt(b.eps)} />
            <Stat Icon={FiHardDrive} label="DWS" value={b.dws != null ? `${fmt(b.dws)} MB/s` : '—'} />
            <Stat Icon={FiDownload} label="Down" value={b.downloadSpeed != null ? `${fmt(b.downloadSpeed)} Mb/s` : '—'} />
            <Stat Icon={FiUpload} label="Up" value={b.uploadSpeed != null ? `${fmt(b.uploadSpeed)} Mb/s` : '—'} />
          </div>
        ) : (
          <div className="whp-stats whp-stats--absent">Benchmark data unavailable</div>
        )}
      </div>

      <div className="whp-col whp-col--load">
        <div className="whp-col__title">Utilisation</div>
        <UtilBar label="CPU" used={node.utilised.cores} total={node.capacity.cores} unit=" threads" decimals={1} />
        <UtilBar label="RAM" used={node.utilised.ramGB} total={node.capacity.ramGB} unit=" GB" decimals={1} />
        <UtilBar label="SSD" used={node.utilised.ssdGB} total={node.capacity.ssdGB} unit=" GB" />

        <div className="whp-col__title whp-col__title--spaced">Categories</div>
        <div className="whp-cats">
          {categories.map(([cat, count]) => {
            const meta = APP_CATEGORY_META[cat] || APP_CATEGORY_META.other;
            const CatIcon = meta.Icon || FiBox;
            return (
              <Tooltip2
                key={cat}
                content={<CategoryTooltip category={cat} />}
                placement="top"
                hoverOpenDelay={200}
                popoverClassName="hov-cat-tooltip"
              >
                <span className="whp-cat" style={{ borderColor: `${meta.color}44` }}>
                  <span style={{ color: meta.color, display: 'inline-flex' }}><CatIcon size={10} /></span>
                  {meta.label}
                  <b>{count}</b>
                </span>
              </Tooltip2>
            );
          })}
        </div>
      </div>

      <div className="whp-col whp-col--apps">
        <div className="whp-col__title">Apps ({apps.length})</div>
        <div className="whp-spec-head">
          <span>Name</span>
          <span>Cat</span>
          <span>Inst</span>
          <span className="whp-spec-num">CPU</span>
          <span className="whp-spec-num">RAM</span>
          <span className="whp-spec-num">SSD</span>
        </div>
        <div className="whp-apps">
          {apps.map(({ name, components, spec }) => {
            const cat = spec?.category || 'other';
            const meta = APP_CATEGORY_META[cat] || APP_CATEGORY_META.other;
            const CatIcon = meta.Icon || FiBox;
            return (
              <div key={name} className="whp-spec-row">
                <span className="whp-spec-name" title={name}>{name}</span>
                <Tooltip2
                  content={<CategoryTooltip category={cat} />}
                  placement="top"
                  hoverOpenDelay={200}
                  popoverClassName="hov-cat-tooltip"
                >
                  <span className="whp-spec-cat" style={{ color: meta.color }}>
                    <CatIcon size={11} />
                  </span>
                </Tooltip2>
                <span className="whp-badge">{components}×</span>
                <span className="whp-spec-num">{fmtSpec(spec?.cpuPerInst, 'c')}</span>
                <span className="whp-spec-num">{fmtSpec(spec?.ramGBPerInst, 'GB')}</span>
                <span className="whp-spec-num">{fmtSpec(spec?.ssdGBPerInst, 'GB')}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function WorkhorsePanel({ gstore, appSpecs }) {
  const nodes = gstore?.workhorseNodes || [];

  // Name -> spec, so each app row can show what it reserves. Built once per
  // spec refresh rather than per card.
  const specsByName = useMemo(() => buildSpecIndex(appSpecs?.rawSpecs), [appSpecs]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);

  // Rotation is a nicety, not a requirement — anyone who prefers less motion
  // gets the first card and the dots to move between them by hand.
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (nodes.length <= 1 || paused || reduceMotion) return undefined;
    timer.current = setInterval(() => setIndex((i) => (i + 1) % nodes.length), ROTATE_MS);
    return () => clearInterval(timer.current);
  }, [nodes.length, paused, reduceMotion]);

  // A shrinking list must not leave the index pointing past the end.
  useEffect(() => {
    if (index >= nodes.length && nodes.length > 0) setIndex(0);
  }, [nodes.length, index]);

  const go = useCallback((i) => {
    setIndex(i);
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (nodes.length === 0) {
    return (
      <div className="hov-panel hov-panel--workhorse">
        <div className="hov-header">
          <span className="hov-header-title">FLUX WORKHORSE</span>
        </div>
        <div className="hov-empty">
          Node data is unavailable right now.
          <br />
          Retrying on the next refresh.
        </div>
      </div>
    );
  }

  const node = nodes[Math.min(index, nodes.length - 1)];

  return (
    <div
      className="hov-panel hov-panel--workhorse"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hov-header">
        <span className="hov-header-title">FLUX WORKHORSE</span>

        <div className="whp-nav">
          <span className="whp-rank">#{index + 1}</span>
          <div className="whp-dots" role="tablist" aria-label="Busiest nodes">
            {nodes.map((n, i) => (
              <button
                key={n.host}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Node ${i + 1}: ${n.host}`}
                className={`whp-dot${i === index ? ' whp-dot--on' : ''}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
        </div>

        <Tooltip2
          content={`${node.containerCount} container${node.containerCount === 1 ? '' : 's'} — a compose app runs one per component`}
          placement="top"
          hoverOpenDelay={250}
          popoverClassName="hov-cat-tooltip"
        >
          <span className="hov-header-badge hov-header-badge--hero">{node.appCount} apps</span>
        </Tooltip2>
      </div>

      <div key={node.host} className={`whp-stage${reduceMotion ? '' : ' whp-stage--enter'}`}>
        <NodeCard node={node} specsByName={specsByName} />
      </div>
    </div>
  );
}
