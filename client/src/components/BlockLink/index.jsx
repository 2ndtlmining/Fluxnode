import { explorerBlockUrl } from 'explorerLinks';
import './index.scss';

/*
 * A block height that opens the block in the explorer (issue #347).
 *
 * DEGRADES TO PLAIN TEXT, deliberately. The explorer's page path takes a hash,
 * not a height, and not every caller has one: chain-activity records written
 * before the scanner persisted hashes carry none, and they refill only as the
 * scanner moves on. A link that 404s is worse than a number that is simply not
 * a link, so a missing or malformed hash renders the height unchanged and
 * nothing tells the reader about a capability they cannot use.
 *
 * `rel="noreferrer"` alongside the usual noopener: this is an outbound link to
 * a third-party site from a page that may be showing a wallet the reader
 * searched for, and the referrer would carry the URL that reveals it.
 */
export function BlockLink({ height, hash, className = '', children }) {
  const label = children ?? `#${Number(height).toLocaleString()}`;
  const href = explorerBlockUrl(hash);

  if (!href) return <span className={`block-link block-link--plain ${className}`}>{label}</span>;

  return (
    <a
      className={`block-link ${className}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open block ${Number(height).toLocaleString()} in the explorer`}
    >
      {label}
    </a>
  );
}
