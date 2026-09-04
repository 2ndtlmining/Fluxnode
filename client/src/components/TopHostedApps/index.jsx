import React from 'react';
import './index.scss';

import { Spinner } from '@blueprintjs/core';
import { shortImageName } from 'utils';

function fmtNum(n, decimals = 0) {
  if (!n && n !== 0) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

// Copied verbatim from home/HomeOverview/index.jsx — see the note in
// AppEcosystemBreakdown/index.jsx for why this is duplicated rather than
// imported.
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

export function TopHostedApps({ gstore }) {
  const images = gstore.topRunningImages || [];
  const isLoading = images.length === 0 && gstore.node_count.total > 0;
  const maxCount = images[0]?.nodeCount || 1;

  return (
    <div className="hov-panel hov-panel--top-apps">
      <PanelHeader title="TOP HOSTED APPS" />
      <div className="hov-ranked-list">
        {isLoading ? (
          <div className="hov-panel-center"><Spinner size={20} /></div>
        ) : images.length === 0 ? (
          <div className="hov-empty">No data available</div>
        ) : (
          images.map(({ image, nodeCount }, i) => (
            <div key={image} className="hov-ranked-row">
              <span className={`hov-rank${i === 0 ? ' hov-rank--gold' : i === 1 ? ' hov-rank--silver' : i === 2 ? ' hov-rank--bronze' : ''}`}>#{i + 1}</span>
              <span className="hov-ranked-name">{shortImageName(image)}</span>
              <div className="hov-ranked-bar-wrap">
                <div
                  className="hov-ranked-bar-fill"
                  style={{ width: `${(nodeCount / maxCount) * 100}%` }}
                />
              </div>
              <span className="hov-badge">{fmtNum(nodeCount)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
