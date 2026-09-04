import { FaMedal } from 'react-icons/fa';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useDonorStatus } from 'contexts/DonorContext';

/*
 * A SEPARATE thing from Home.jsx's existing "Total donations: N" badge
 * (which shows lifetime donation tx count for WHATEVER wallet is currently
 * being viewed on Home — unrelated to premium-unlock status). This badge
 * reflects the ACTIVE donor context specifically: only renders when the
 * connected wallet (DonorContext.donorWallet) is a verified, unlocked donor.
 */
export function DonorBadge() {
  const { donorStatus } = useDonorStatus();
  if (!donorStatus?.isDonor) return null;

  return (
    <Tooltip2 content={`Donor active — ${donorStatus.daysLeft} days left`} hoverOpenDelay={60}>
      <span className="donor-badge d-inline-flex align-items-center gap-1">
        <FaMedal color="gold" size={16} />
        Donor
      </span>
    </Tooltip2>
  );
}
