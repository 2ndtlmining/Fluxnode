import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import './index.scss';

/*
 * Wraps a premium route. Real donor verification isn't built yet (see
 * PREMIUM_FEATURES_PLAN.md), so today this only ever unlocks via the
 * PREMIUM_TESTING_MODE flag (client/src/donor/config.js) — every real
 * visitor sees the locked explainer below.
 */
export function PremiumGate({ feature, children }) {
  const { isUnlocked } = useDonorStatus();

  if (isUnlocked) return children;

  return (
    <div className="premium-gate-locked">
      <Lock size={28} className="premium-gate-locked-icon" />
      <span className="premium-gate-locked-title">{feature} is a premium feature</span>
      <span className="premium-gate-locked-body">
        Donor-based unlocking (send FLUX to our donation address to unlock) is coming soon.
      </span>
    </div>
  );
}
