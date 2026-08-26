import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import './index.scss';

import { Tooltip2 } from '@blueprintjs/popover2';
import { FiCpu, FiHardDrive, FiDownload, FiUpload, FiBox } from 'react-icons/fi';

import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';
import { categorizeApp, isOpaqueRuntimeImage } from 'main/Gamification/appCategories';
import { shortImageName } from 'utils';

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

function NodeCard({ node }) {
  // Containers, not distinct apps — the same image can run more than once on a
  // node, and the count in the header counts containers too.
  const apps = useMemo(() => {
    const counts = {};
    for (const image of node.images || []) {
      const name = shortImageName(image);
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [node.images]);

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
        <div className="whp-ip">{node.host}</div>

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
            <Stat Icon={FiCpu} label="EPS" value={fmt(b.eps)} />
            <Stat Icon={FiHardDrive} label="DWS" value={fmt(b.dws)} />
            <Stat Icon={FiDownload} label="Down" value={b.downloadSpeed != null ? `${fmt(b.downloadSpeed)} Mb/s` : '—'} />
            <Stat Icon={FiUpload} label="Up" value={b.uploadSpeed != null ? `${fmt(b.uploadSpeed)} Mb/s` : '—'} />
          </div>
        ) : (
          <div className="whp-stats whp-stats--absent">Benchmark data unavailable</div>
        )}
      </div>

      <div className="whp-col whp-col--load">
        <div className="whp-col__title">Utilisation</div>
        <UtilBar label="CPU" used={node.utilised.cores} total={node.capacity.cores} unit="" decimals={1} />
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
        <div className="whp-col__title">Apps ({node.appCount})</div>
        <ul className="whp-apps">
          {apps.map(({ name, count }) => (
            <li key={name} className="whp-app">
              <span className="whp-app__name">{name}</span>
              {count > 1 && <span className="whp-app__count">×{count}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function WorkhorsePanel({ gstore }) {
  const nodes = gstore?.workhorseNodes || [];
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

        <span className="hov-header-badge hov-header-badge--hero">{node.appCount} apps</span>
      </div>

      <div key={node.host} className={`whp-stage${reduceMotion ? '' : ' whp-stage--enter'}`}>
        <NodeCard node={node} />
      </div>
    </div>
  );
}
