import React, { useState } from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { ChevronDown } from 'lucide-react';
import CountUp from 'components/CountUp';

import { APP_CATEGORY_META } from 'content/appCategoryMeta';
import { CategoryTooltip } from 'components/CategoryTooltip';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// Copied verbatim from home/HomeOverview/index.jsx (not exported there, and
// used by several other Home-only panels that aren't moving — duplicating
// this small presentational wrapper is simpler and safer than threading a
// shared import through Home's file for one component's sake).
function PanelHeader({ title, badge, badgeClassName, badgeContent, right }) {
  return (
    <div className="hov-header">
      <span className="hov-header-title">{title}</span>
      {right}
      {badgeContent ?? (badge != null && (
        <span className={`hov-header-badge${badgeClassName ? ' ' + badgeClassName : ''}`}>
          {fmtNum(badge)}
        </span>
      ))}
    </div>
  );
}

// Discrete size steps (not a continuous scale, which reads as noisy) so a
// category's row visually communicates roughly how big it is relative to the
// network's largest category, instead of every row looking identical.
function ecoWeightClass(totalInstances, maxVal) {
  const ratio = maxVal > 0 ? totalInstances / maxVal : 0;
  if (ratio >= 0.5) return 'hov-eco-row--lg';
  if (ratio >= 0.15) return 'hov-eco-row--md';
  return 'hov-eco-row--sm';
}

export function AppEcosystemBreakdown({ gstore }) {
  const { runningCategoryMap, runningCategoryTop, node_count, runningAppsStatus, runningAppsFetchedAt } = gstore;
  const hasRunning = Object.keys(runningCategoryMap).length > 0;
  const [expandedCategory, setExpandedCategory] = useState(null);

  // Still loading if no node data at all
  if (!hasRunning && node_count.total === 0) {
    return (
      <div className="hov-panel hov-panel-center hov-panel--ecosystem">
        <Spinner size={24} />
      </div>
    );
  }

  /*
   * Single source of truth: running containers reported by the nodes.
   *
   * This panel used to fall back to globalappsspecifications whenever the
   * running-app fetch came back empty. That endpoint counts ORDERED instances,
   * not running containers, so the whole panel would silently re-render with
   * different numbers and a different row order — reported as the "Other"
   * category jumping and then settling (issue #144). Retry and last-known-good
   * caching now happen in fetch_fluxinfo_aggregate; if there is genuinely
   * nothing to show we say so rather than swapping in another dataset.
   */
  if (!hasRunning) {
    return (
      <div className="hov-panel hov-panel--ecosystem">
        <PanelHeader title="APP ECOSYSTEM" />
        <div className="hov-empty">
          Running app data is unavailable right now.
          <br />
          Retrying on the next refresh.
        </div>
      </div>
    );
  }

  const allCats = Object.entries(runningCategoryMap)
    .map(([category, totalInstances]) => ({ category, totalInstances }))
    .sort((a, b) => b.totalInstances - a.totalInstances);

  const isStale = runningAppsStatus === 'stale';
  const staleSince = runningAppsFetchedAt ? new Date(runningAppsFetchedAt).toLocaleTimeString() : null;

  const cats = allCats.slice(0, 12);
  const grandTotal = allCats.reduce((s, c) => s + c.totalInstances, 0) || 1;
  const maxVal = cats[0]?.totalInstances || 1;

  return (
    <div className="hov-panel hov-panel--ecosystem">
      <PanelHeader
        title="APP ECOSYSTEM"
        right={
          isStale ? (
            <Tooltip2
              content={`Live data is unreachable. Showing the last successful reading${staleSince ? ' from ' + staleSince : ''}.`}
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-eco-stale">stale</span>
            </Tooltip2>
          ) : null
        }
        badgeContent={
          grandTotal > 1 ? (
            <Tooltip2
              content="Running containers across the network. Multi-component apps contribute one per component."
              placement="top"
              hoverOpenDelay={250}
              transitionDuration={80}
              popoverClassName="hov-cat-tooltip"
            >
              <span className="hov-header-badge hov-header-badge--hero">
                <CountUp end={grandTotal} />
              </span>
            </Tooltip2>
          ) : null
        }
      />

      <div className="hov-eco-list">
        {cats.map(({ category, totalInstances }) => {
          const meta = APP_CATEGORY_META[category] || APP_CATEGORY_META.other;
          const { label, Icon, color } = meta;
          const barPct = (totalInstances / maxVal) * 100;
          const sharePct = ((totalInstances / grandTotal) * 100).toFixed(0);
          const breakdown = runningCategoryTop?.[category];
          const tooltip = <CategoryTooltip category={category} breakdown={breakdown} />;
          const isExpanded = expandedCategory === category;
          const weightClass = ecoWeightClass(totalInstances, maxVal);

          const toggleExpanded = () => setExpandedCategory(isExpanded ? null : category);

          return (
            <div key={category} className="hov-eco-item">
              <div
                className={`hov-eco-row ${weightClass}${isExpanded ? ' hov-eco-row--expanded' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                onClick={toggleExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded();
                  }
                }}
              >
                <span className="hov-eco-icon" style={{ color }}>
                  <Icon size={11} />
                </span>
                <Tooltip2
                  content={tooltip}
                  placement="top"
                  hoverOpenDelay={250}
                  transitionDuration={80}
                  popoverClassName="hov-cat-tooltip"
                >
                  <span className="hov-eco-label">{label}</span>
                </Tooltip2>
                <div className="hov-eco-bar-wrap">
                  <div className="hov-eco-bar-fill" style={{ width: `${barPct}%`, background: color }} />
                </div>
                <span className="hov-eco-count">{fmtNum(totalInstances)}</span>
                <span className="hov-eco-pct">{sharePct}%</span>
                <ChevronDown
                  size={12}
                  className={`hov-eco-chevron${isExpanded ? ' hov-eco-chevron--open' : ''}`}
                />
              </div>
              {isExpanded && (
                <div className="hov-eco-expand">
                  <CategoryTooltip category={category} breakdown={breakdown} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
