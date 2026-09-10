import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import { getPanelAccess } from 'analytics/panelAccess';
import './index.scss';

/*
 * Per-panel sibling to donor/PremiumGate (which gates a whole route).
 *
 * `preview` controls the locked-state treatment:
 * - 'plain' (default): the original flat lock-message card. This is what
 *   every caller gets unless it opts in — /live's PremiumGate-equivalent
 *   route gate and the Donor/Chain Activity tabs (Analytics.jsx) never
 *   pass this prop and must keep rendering exactly as before.
 * - 'blur': the real children still render (mount, fetch, etc. — nothing
 *   about data-fetching changes based on lock state, per Session 1's
 *   design), but visually blurred/dimmed underneath a lock overlay. Used
 *   by AppsTab/NetworkTab (Session 3) to preview real data shapes behind
 *   the wall instead of hiding them entirely.
 */
export function PanelGate({ panelKey, feature, children, preview = 'plain' }) {
  const { isUnlocked } = useDonorStatus();

  if (getPanelAccess(panelKey, isUnlocked)) return children;

  if (preview === 'blur') {
    return (
      <div className="panel-gate-blurred">
        <div className="panel-gate-blurred-content" aria-hidden="true">
          {children}
        </div>
        <div className="panel-gate-blurred-overlay">
          <div className="panel-gate-blurred-scrim" />
          <div className="panel-gate-blurred-card">
            <Lock size={20} className="panel-gate-locked-icon" />
            <span className="panel-gate-locked-title">{feature} is a premium feature</span>
            <PremiumUnlock />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-gate-locked">
      <Lock size={20} className="panel-gate-locked-icon" />
      <span className="panel-gate-locked-title">{feature} is a premium feature</span>
      <PremiumUnlock />
    </div>
  );
}
