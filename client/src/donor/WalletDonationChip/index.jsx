import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { Tooltip2 } from '@blueprintjs/popover2';
import { walletDonationState } from 'donor/walletDonationState';
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
 */
export function WalletDonationChip({ address, donationCount, settled, failed, donationAddress }) {
  const state = walletDonationState({ address, donationCount, settled, failed });
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

  return (
    <Tooltip2
      content={
        <span>
          FluxNode is free and unfunded. If it saves you time, a donation to{' '}
          <strong>{donationAddress}</strong> keeps it running.
        </span>
      }
      placement="bottom"
      hoverOpenDelay={60}
    >
      <span className="wdc wdc--ask">
        <FaRegHeart size={12} aria-hidden="true" />
        Support development
      </span>
    </Tooltip2>
  );
}
