import { Lock } from 'lucide-react';
import { useDonorStatus } from 'contexts/DonorContext';
import { PremiumUnlock } from 'donor/PremiumUnlock';
import './index.scss';

/*
 * Wraps a premium route. Shows a locked explainer with the inline
 * PremiumUnlock unlock UI in place of real content when not unlocked.
 * Deliberately kept here rather than in the Navbar's click handler, so
 * any future premium route gets a working unlock affordance for free
 * just by wrapping it in this same component.
 */
export function PremiumGate({ feature, children }) {
  const { isUnlocked } = useDonorStatus();

  if (isUnlocked) return children;

  return (
    <div className="premium-gate-locked">
      <Lock size={28} className="premium-gate-locked-icon" />
      <span className="premium-gate-locked-title">{feature} is a premium feature</span>
      <span className="premium-gate-locked-body">
        Send FLUX to our donation address to unlock it.
      </span>
      <PremiumUnlock />
    </div>
  );
}
