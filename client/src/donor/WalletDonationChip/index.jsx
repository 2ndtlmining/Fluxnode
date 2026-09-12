import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { BsCheckLg, BsClipboard } from 'react-icons/bs';
import { Tooltip2 } from '@blueprintjs/popover2';
import { walletDonationState } from 'donor/walletDonationState';
import { useCopyAddress } from 'donor/useCopyAddress';
import './index.scss';

/*
 * Says something about the wallet currently being viewed, in both directions
 * (issue #258).
 *
 * Before this there were two gold medals side by side next to the wallet
 * address -- DonorBadge (premium unlocked) and a second medal counting this
 * wallet's donations -- which looked identical and meant different things, and
 * nothing at all for a wallet that had never donated. That silence was the gap:
 * most people arrive, paste a wallet, watch their nodes, and are never told
 * the site is worth supporting.
 *
 * A heart rather than another medal, so it cannot be confused with the premium
 * badge sitting beside it.
 *
 * The wording stays deliberately neutral (#294). A blunter label for the
 * non-donor state was considered and rejected: it is the default state for
 * every first-time visitor, it renders next to the user's own wallet address
 * where it gets screenshotted, and walletDonationState already documents why
 * accusing the wrong person here is the outcome worth engineering against.
 */
export function WalletDonationChip({ address, donationCount, settled, failed, donationAddress }) {
  const state = walletDonationState({ address, donationCount, settled, failed });
  const { copied, failed: copyFailed, copy } = useCopyAddress(donationAddress);

  if (state === 'hidden') return null;

  if (state === 'supporter') {
    const plural = donationCount === 1 ? 'donation' : 'donations';
    return (
      <Tooltip2
        content={`${donationCount} ${plural} from this wallet. Thank you for keeping FluxNode running.`}
        placement="bottom"
        hoverOpenDelay={60}
      >
        <span className="wdc wdc--supporter">
          <FaHeart size={12} aria-hidden="true" />
          Supporter
        </span>
      </Tooltip2>
    );
  }

  /*
   * The chip itself copies, rather than a copy button inside the tooltip
   * (#294).
   *
   * The address used to live in this tooltip as bold text, which meant
   * selecting it by hand while racing the tooltip's own dismissal -- a plain
   * Tooltip2 closes the moment the pointer leaves the chip, so anything
   * clickable inside it is nearly unhittable. Making the chip the target gives
   * one place to aim, works on touch where there is no hover at all, and turns
   * the tooltip back into an explanation instead of an obstacle.
   */
  const tooltip = copied
    ? 'Donation address copied'
    : copyFailed
      ? `Copy blocked by the browser — the address is ${donationAddress}`
      : (
          <span>
            FluxNode is free and unfunded. Click to copy the donation address{' '}
            <strong>{donationAddress}</strong>.
          </span>
        );

  return (
    <Tooltip2 content={tooltip} placement="bottom" hoverOpenDelay={60}>
      <button
        type="button"
        className={`wdc wdc--ask${copied ? ' wdc--copied' : ''}${copyFailed ? ' wdc--failed' : ''}`}
        onClick={copy}
        disabled={!donationAddress}
        aria-label={`Copy the FluxNode donation address${copied ? ' (copied)' : ''}`}
      >
        {copied ? <BsCheckLg size={12} aria-hidden="true" /> : <FaRegHeart size={12} aria-hidden="true" />}
        {copied ? 'Address copied' : 'Support development'}
        {!copied && <BsClipboard size={11} className="wdc-copy-icon" aria-hidden="true" />}
      </button>
    </Tooltip2>
  );
}
