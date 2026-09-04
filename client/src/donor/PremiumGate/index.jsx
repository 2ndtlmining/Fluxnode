import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@blueprintjs/core';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonorUnlockDialog } from 'donor/DonorUnlockDialog';
import './index.scss';

/*
 * Wraps a premium route. Shows a locked explainer with a real "Unlock" button
 * in place of real content when not unlocked — the button opens
 * DonorUnlockDialog, the only place a wallet is entered. Deliberately kept
 * here rather than in the Navbar's click handler, so any future premium
 * route (e.g. /analytics) gets a working unlock affordance for free just by
 * wrapping it in this same component.
 */
export function PremiumGate({ feature, children }) {
  const { isUnlocked } = useDonorStatus();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isUnlocked) return children;

  return (
    <div className="premium-gate-locked">
      <Lock size={28} className="premium-gate-locked-icon" />
      <span className="premium-gate-locked-title">{feature} is a premium feature</span>
      <span className="premium-gate-locked-body">
        Send FLUX to our donation address to unlock it.
      </span>
      <Button text="Unlock" intent="primary" onClick={() => setDialogOpen(true)} />
      <DonorUnlockDialog isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
