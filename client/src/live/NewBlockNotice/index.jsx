// client/src/live/NewBlockNotice/index.jsx
import React from 'react';
import './index.scss';

/*
 * Spec §29: "New block while historical" — shown whenever the live tip has
 * moved past whatever block the user is currently inspecting. The caller
 * (Live.jsx) only renders this when that's actually true, so this component
 * has no internal visibility logic of its own — it just always shows
 * tipHeight, which is naturally always current (spec's own example number
 * #2923515 is exactly "whatever the current tip is", not a frozen snapshot
 * of the block that first triggered this).
 */
export function NewBlockNotice({ tipHeight, onReturnToLive }) {
  return (
    <div className="live-new-block-notice">
      <span className="live-new-block-dot" />
      <span className="live-new-block-label">NEW BLOCK #{tipHeight}</span>
      <button type="button" className="live-new-block-btn" onClick={onReturnToLive}>
        Return to Live
      </button>
    </div>
  );
}
