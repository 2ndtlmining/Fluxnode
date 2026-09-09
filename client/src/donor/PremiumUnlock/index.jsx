import { useState } from 'react';
import { Button, InputGroup, Spinner } from '@blueprintjs/core';
import { DONOR_THRESHOLD_FLUX } from 'donor/config';
import { ADDRESS_FLUX } from 'content/index';
import { DonateChip } from 'components/Footer';
import { useDonorWalletCheck } from 'donor/useDonorWalletCheck';
import { CHECK_STATUS } from 'donor/donorWalletCheck';
import './index.scss';

/*
 * Inline replacement for the old DonorUnlockDialog modal — same
 * verification flow and messages, rendered directly wherever a locked
 * surface needs an unlock affordance (PremiumGate, PanelGate, DonorTab's
 * NoWalletState) instead of behind a click-to-open dialog.
 */
export function PremiumUnlock() {
  const { status, result, check } = useDonorWalletCheck();
  const [address, setAddress] = useState('');

  const handleCheck = () => {
    if (!address.trim() || status === CHECK_STATUS.CHECKING) return;
    check(address);
  };

  return (
    <div className="premium-unlock">
      <p className="premium-unlock-intro">
        Send at least {DONOR_THRESHOLD_FLUX} FLUX to our donation address within the
        last year, then enter the wallet you sent it from below.
      </p>

      <div className="premium-unlock-input-row">
        <InputGroup
          placeholder="t1... or t3..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={status === CHECK_STATUS.CHECKING}
          fill
        />
        <Button
          text={status === CHECK_STATUS.CHECKING ? 'Checking…' : 'Check wallet'}
          icon={status === CHECK_STATUS.CHECKING ? <Spinner size={16} /> : 'search'}
          onClick={handleCheck}
          disabled={!address.trim() || status === CHECK_STATUS.CHECKING}
          intent="primary"
        />
      </div>

      {status === CHECK_STATUS.INVALID && (
        <div className="premium-unlock-message premium-unlock-message--error">
          That doesn't look like a real Flux wallet address.
        </div>
      )}

      {status === CHECK_STATUS.SUCCESS && result && (
        <div className="premium-unlock-message premium-unlock-message--success">
          Unlocked — donor status active, {result.daysLeft} days left.
        </div>
      )}

      {status === CHECK_STATUS.UNVERIFIED && (
        <div className="premium-unlock-message premium-unlock-message--error">
          Couldn't reach the Flux explorer right now — try again in a moment.
        </div>
      )}

      {status === CHECK_STATUS.FAILURE && result && (
        <div className="premium-unlock-message premium-unlock-message--error">
          <span>
            This wallet has sent {result.totalInWindow.toFixed(2)} FLUX in the last
            year — needs at least {DONOR_THRESHOLD_FLUX}.
          </span>
          <DonateChip label="FLUX" address={ADDRESS_FLUX} />
        </div>
      )}
    </div>
  );
}
