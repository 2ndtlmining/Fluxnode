import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import { getPanelAccess } from 'analytics/panelAccess';
import './index.scss';

/*
 * Per-panel sibling to donor/PremiumGate (which gates a whole route).
 * Session 1 ships this with the same plain locked-message treatment
 * PremiumGate already has — the blurred/ghosted real-data-preview
 * treatment is Part D of the spec, done visually in Sessions 3-4, not
 * here. This task only makes locking/unlocking work correctly per panel.
 */
export function PanelGate({ panelKey, feature, children }) {
  const { isUnlocked } = useDonorStatus();

  if (getPanelAccess(panelKey, isUnlocked)) return children;

  return (
    <div className="panel-gate-locked">
      <Lock size={20} className="panel-gate-locked-icon" />
      <span className="panel-gate-locked-title">{feature} is a premium feature</span>
      <PremiumUnlock />
    </div>
  );
}
