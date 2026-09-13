import { Coins, Rocket, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { TIER_META } from 'live/tierMeta';

// Display metadata for every activity category a block can contain, and the
// section order/labels the Details panel groups them under. Tier entries
// (node reward payments) reuse the same colors used elsewhere on the site.
export const CATEGORY_META = {
  CUMULUS: { ...TIER_META.CUMULUS, Icon: Coins, kind: 'reward', tooltip: 'Cumulus node reward paid this block (exact amount, from the coinbase transaction)' },
  NIMBUS: { ...TIER_META.NIMBUS, Icon: Coins, kind: 'reward', tooltip: 'Nimbus node reward paid this block (exact amount, from the coinbase transaction)' },
  STRATUS: { ...TIER_META.STRATUS, Icon: Coins, kind: 'reward', tooltip: 'Stratus node reward paid this block (exact amount, from the coinbase transaction)' },
  DEVFUND: { ...TIER_META.DEVFUND, Icon: Coins, kind: 'reward', tooltip: 'Dev Fund treasury payment this block (exact amount, from the coinbase transaction)' },
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
    /*
     * Orchid, not yellow (issue #348).
     *
     * Yellow #eab308 sits at hue 45 and NIMBUS sits at 31 -- fourteen degrees
     * apart, which is indistinguishable at the 20px tile the block pulse draws.
     * Confirmations are the BULK of a block (11 of 15 in the report), so they
     * were a wall of near-Nimbus, and a reward tile disappeared into it.
     *
     * Changing CONFIRM rather than NIMBUS: the tier colours are used site-wide
     * -- node tables, charts, chips -- while this yellow appears only here and
     * on /live, so this is the one that can move without a ripple.
     *
     * ~292 is the most isolated free hue given what is already in use (blue
     * 205, indigo 239, red 349, orange 31, green 142): 55 degrees clear of
     * both DEVFUND indigo and STRATUS red. True pink was the first thought and
     * is worse -- it lands beside STRATUS at 349.
     */
    color: '#c264d6',
    Icon: ShieldCheck,
    kind: 'confirm',
    tooltip: 'A node re-confirming itself as active this block',
  },
};

// The Details panel's four sections, in display order. `emptyLabel` overrides
// the generic "None this block" message for sections where a block-by-block
// zero is the common case rather than a sign something's broken — see
// Live.jsx / apidata.js for why P2P sends and deploy scans are naturally rare
// per block.
export const DETAIL_SECTIONS = [
  { key: 'reward', label: 'Node Rewards', color: '#3b82f6', Icon: Coins },
  {
    key: 'p2p',
    label: 'P2P Transfers',
    color: '#8b93a6',
    Icon: ArrowLeftRight,
    emptyLabel: 'No P2P transfers this block — most blocks carry none',
  },
  {
    key: 'deploy',
    label: 'Cloud Deployments',
    color: '#22c55e',
    Icon: Rocket,
    emptyLabel: 'None yet — deployments are scanned network-wide every 5 min, not every block',
  },
  // Orchid, matching CATEGORY_META.CONFIRM above (#348) -- /live's details
  // panel and the block pulse must agree on what a colour means.
  { key: 'confirm', label: 'Node Confirmations', color: '#c264d6', Icon: ShieldCheck },
];
