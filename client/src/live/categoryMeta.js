import { Coins, Rocket, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { TIER_META } from 'live/tierMeta';

// Display metadata for every activity category a block can contain, and the
// section order/labels the Details panel groups them under. Tier entries
// (node reward payments) reuse the same colors used elsewhere on the site.
export const CATEGORY_META = {
  CUMULUS: { ...TIER_META.CUMULUS, Icon: Coins, kind: 'reward', tooltip: 'Cumulus node reward paid this block (exact amount, from the coinbase transaction)' },
  NIMBUS: { ...TIER_META.NIMBUS, Icon: Coins, kind: 'reward', tooltip: 'Nimbus node reward paid this block (exact amount, from the coinbase transaction)' },
  STRATUS: { ...TIER_META.STRATUS, Icon: Coins, kind: 'reward', tooltip: 'Stratus node reward paid this block (exact amount, from the coinbase transaction)' },
  DEPLOY: { label: 'Deployed', color: '#22c55e', Icon: Rocket, kind: 'deploy', tooltip: 'A Flux app was deployed this block' },
  P2P: {
    label: 'P2P',
    color: '#8b93a6',
    Icon: ArrowLeftRight,
    kind: 'p2p',
    tooltip: 'A real on-chain transfer this block — a small share may be app-funding rather than a personal send',
  },
  CONFIRM: {
    label: 'Confirmed',
    color: '#eab308',
    Icon: ShieldCheck,
    kind: 'confirm',
    tooltip: 'A node re-confirming itself as active this block',
  },
};

// The Details panel's four sections, in display order.
export const DETAIL_SECTIONS = [
  { key: 'reward', label: 'Node Rewards', color: '#3b82f6', Icon: Coins },
  { key: 'p2p', label: 'P2P Transfers', color: '#8b93a6', Icon: ArrowLeftRight },
  { key: 'deploy', label: 'Cloud Deployments', color: '#22c55e', Icon: Rocket },
  { key: 'confirm', label: 'Node Confirmations', color: '#eab308', Icon: ShieldCheck },
];
