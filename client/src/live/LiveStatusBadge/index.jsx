// client/src/live/LiveStatusBadge/index.jsx
import React from 'react';
import './index.scss';

/*
 * Spec §26-27: an honest status readout — never claims websocket-precision
 * realtime, never predicts "next block in Ns". Four states map 1:1 to
 * computeLiveStatus's return values (live/liveStatus.js).
 */
export function LiveStatusBadge({ status, tipHeight, updatedAgoText, selectedHeight, historicalAgoText, onReturnToLive }) {
  if (status === 'historical') {
    return (
      <div className="live-status-badge live-status-badge--historical">
        <span className="live-status-label">HISTORY</span>
        <span className="live-status-detail">
          Viewing #{selectedHeight}{historicalAgoText ? ` · ${historicalAgoText}` : ''}
        </span>
        <button type="button" className="live-status-return-btn" onClick={onReturnToLive}>
          Return to Live
        </button>
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div className="live-status-badge live-status-badge--syncing">
        <span className="live-status-dot live-status-dot--syncing" />
        <span className="live-status-label">SYNCING</span>
        <span className="live-status-detail">Checking network…</span>
      </div>
    );
  }

  if (status === 'delayed') {
    return (
      <div className="live-status-badge live-status-badge--delayed">
        <span className="live-status-dot live-status-dot--delayed" />
        <span className="live-status-label">DELAYED</span>
        <span className="live-status-detail">
          Last update {updatedAgoText || 'a while ago'} · Retrying automatically
        </span>
      </div>
    );
  }

  return (
    <div className="live-status-badge live-status-badge--live">
      <span className="live-status-dot live-status-dot--live" />
      <span className="live-status-label">LIVE</span>
      <span className="live-status-detail">
        {tipHeight != null ? `Network tip #${tipHeight} · ` : ''}Updated {updatedAgoText || 'just now'}
      </span>
    </div>
  );
}
