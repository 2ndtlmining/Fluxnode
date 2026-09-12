import { GiSpermWhale, GiDolphin, GiFishbone } from 'react-icons/gi';
import { Tooltip2 } from '@blueprintjs/popover2';
import { richListBand, RICH_LIST_BANDS } from 'wallet/richList';
import './index.scss';

/*
 * Where this wallet sits on the Flux rich list, banded (issue #266).
 *
 * Previously nothing appeared here at all -- rich-list membership only fed an
 * achievement, and even there it was binary. A wallet at rank 1,000 (26,974
 * FLUX) and one at rank 1 (160 million) were indistinguishable.
 *
 * Three creatures rather than three copies of the same whale, so the band is
 * readable at a glance without reading the label. The whale is reserved for the
 * top 100, which is the only group the word was ever really meant for.
 */
const BAND_ICONS = {
  top100: GiSpermWhale,
  top500: GiDolphin,
  top1000: GiFishbone
};

export function RichListChip({ rank, privacyMode }) {
  const band = richListBand(rank);
  if (!band) return null;

  /*
   * Privacy Mode hides the band, not just the rank.
   *
   * The address, balance and USD value are all masked when it is on; leaving a
   * "Top 100" badge visible would leak the wealth bracket those maskings exist
   * to hide -- arguably the most sensitive fact on the page, since it is
   * exactly what makes a wallet worth targeting.
   */
  if (privacyMode) return null;

  const Icon = BAND_ICONS[band];
  const { label, blurb } = RICH_LIST_BANDS[band];

  return (
    <Tooltip2 content={`${blurb} — currently #${rank.toLocaleString()}`} placement="bottom" hoverOpenDelay={60}>
      <span className={`rlc rlc--${band}`}>
        <Icon size={13} aria-hidden="true" />
        {label}
      </span>
    </Tooltip2>
  );
}
