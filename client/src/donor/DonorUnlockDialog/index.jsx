import { useCallback, useState } from 'react';
import { Button, Dialog, InputGroup, Spinner } from '@blueprintjs/core';
import { validateAddress } from 'apidata';
import { fetch_donor_status } from 'donor/donorStatus';
import { DONOR_THRESHOLD_FLUX } from 'donor/config';
import { useDonorStatus } from 'contexts/DonorContext';
import { DonateChip } from 'components/Footer';
import { ADDRESS_FLUX } from 'content/index';
import './index.scss';

const STATUS = { IDLE: 'idle', CHECKING: 'checking', SUCCESS: 'success', FAILURE: 'failure', INVALID: 'invalid', UNVERIFIED: 'unverified' };

/*
 * The only place a wallet address is entered to unlock premium features.
 * Checks are always a full fetch_donor_status call here (never assumed) —
 * on success, the result is handed to DonorContext.setDonorWallet directly
 * so it doesn't have to re-fetch what this dialog just fetched.
 */
export function DonorUnlockDialog({ isOpen, onClose }) {
  const { setDonorWallet } = useDonorStatus();
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [result, setResult] = useState(null);

  const handleCheck = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    setStatus(STATUS.CHECKING);
    setResult(null);

    const looksReal = await validateAddress(trimmed);
    if (!looksReal) {
      setStatus(STATUS.INVALID);
      return;
    }

    const donorResult = await fetch_donor_status(trimmed);
    setResult(donorResult);
    if (donorResult.isDonor) {
      setDonorWallet(trimmed, donorResult);
      setStatus(STATUS.SUCCESS);
    } else if (!donorResult.verified) {
      setStatus(STATUS.UNVERIFIED);
    } else {
      setStatus(STATUS.FAILURE);
    }
  }, [address, setDonorWallet]);

  const handleClose = useCallback(() => {
    setAddress('');
    setStatus(STATUS.IDLE);
    setResult(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Unlock premium features"
      className="donor-unlock-dialog"
      // Blueprint portals dialogs to document.body by default — a sibling
      // of .App, not a descendant, so neither Blueprint's own .bp4-dark
      // theme nor this app's dark-mode CSS custom properties (both set on
      // .App) would reach it. Rendering inline instead keeps it a real
      // descendant, so both inherit correctly with no extra plumbing.
      usePortal={false}
    >
      <div className="donor-unlock-body">
        <p className="donor-unlock-intro">
          Send at least {DONOR_THRESHOLD_FLUX} FLUX to our donation address within the
          last year, then enter the wallet you sent it from below.
        </p>

        <div className="donor-unlock-input-row">
          <InputGroup
            placeholder="t1... or t3..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={status === STATUS.CHECKING}
            fill
          />
          <Button
            text={status === STATUS.CHECKING ? 'Checking…' : 'Check wallet'}
            icon={status === STATUS.CHECKING ? <Spinner size={16} /> : 'search'}
            onClick={handleCheck}
            disabled={!address.trim() || status === STATUS.CHECKING}
            intent="primary"
          />
        </div>

        {status === STATUS.INVALID && (
          <div className="donor-unlock-message donor-unlock-message--error">
            That doesn't look like a real Flux wallet address.
          </div>
        )}

        {status === STATUS.SUCCESS && result && (
          <div className="donor-unlock-message donor-unlock-message--success">
            Unlocked — donor status active, {result.daysLeft} days left.
          </div>
        )}

        {status === STATUS.UNVERIFIED && (
          <div className="donor-unlock-message donor-unlock-message--error">
            Couldn't reach the Flux explorer right now — try again in a moment.
          </div>
        )}

        {status === STATUS.FAILURE && result && (
          <div className="donor-unlock-message donor-unlock-message--error">
            <span>
              This wallet has sent {result.totalInWindow.toFixed(2)} FLUX in the last
              year — needs at least {DONOR_THRESHOLD_FLUX}.
            </span>
            <DonateChip label="FLUX" address={ADDRESS_FLUX} />
          </div>
        )}
      </div>
    </Dialog>
  );
}
