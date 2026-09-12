import React, { useContext } from 'react';
import './index.scss';

import { IconContext } from 'react-icons';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useCopyAddress } from 'donor/useCopyAddress';
import { truncateAddress } from 'donor/clipboard';
import { LayoutContext } from 'contexts/LayoutContext';

import { IoLogoTwitter, IoMailUnread, IoLogoYoutube } from 'react-icons/io5';
import { BsGithub, BsBugFill, BsCheckLg, BsClipboard } from 'react-icons/bs';

import { URL_YOUTUBE, URL_TWITTER, URL_GITHUB, EMAIL, ADDRESS_FLUX } from 'content/index';

import { IS_TEST_BUILD, IS_DEV, APP_VERSION } from 'app-buildinfo';
import { useHostInfo } from './useHostInfo';

function _RenderAppVersion() {
  let suffix = '';
  if (IS_TEST_BUILD) suffix = '-test';
  else if (IS_DEV) suffix = '-dev';

  return `v${APP_VERSION}${suffix}`;
}

const SOCIAL_LINKS = [
  { key: 'twitter', href: URL_TWITTER, label: 'Twitter', Icon: IoLogoTwitter },
  { key: 'youtube', href: URL_YOUTUBE, label: 'YouTube', Icon: IoLogoYoutube },
  { key: 'email', href: `mailto:${EMAIL}`, label: 'Email us', Icon: IoMailUnread },
  { key: 'github', href: URL_GITHUB, label: 'Source on GitHub', Icon: BsGithub },
  {
    key: 'bug',
    href: 'https://github.com/2ndtlmining/Fluxnode/issues',
    label: 'Report an issue',
    Icon: BsBugFill
  }
];

export function DonateChip({ label, address }) {
  // Was an inline clipboard implementation here; it is now shared with the node
  // page's donation chip and Home's support panel (#294), which previously had
  // no way to copy at all.
  const { copied, failed, copy } = useCopyAddress(address);

  if (!address) return null;

  return (
    <Tooltip2
      content={failed ? `Copy blocked by the browser — ${address}` : copied ? 'Copied to clipboard' : address}
      placement="top"
      hoverOpenDelay={150}
      popoverClassName="footer-addr-tooltip"
    >
      <button
        type="button"
        className={`footer-chip${copied ? ' footer-chip--copied' : ''}`}
        onClick={copy}
        aria-label={`Copy ${label} donation address`}
      >
        <span className="footer-chip__label">{label}</span>
        <span className="footer-chip__addr">{truncateAddress(address)}</span>
        <span className="footer-chip__icon">{copied ? <BsCheckLg /> : <BsClipboard />}</span>
      </button>
    </Tooltip2>
  );
}

export function Footer() {
  const hostSegments = useHostInfo();
  const { lastUpdated, arcaneHumanVersion } = useContext(LayoutContext);

  return (
    <footer className="v-footer">
      <div className="footer-inner">
        <div className="footer-bar">
          <div className="footer-bar__left">
            <IconContext.Provider value={{ size: '18px', color: '#12cc94' }}>
              <ul className="links-list">
                {SOCIAL_LINKS.map(({ key, href, label, Icon }) => (
                  <li key={key}>
                    <Tooltip2 content={label} placement="top" hoverOpenDelay={200}>
                      <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}>
                        <Icon className="footer-logo" />
                      </a>
                    </Tooltip2>
                  </li>
                ))}
              </ul>
            </IconContext.Provider>

            <span className="footer-meta">
              <span className="hl-app-version">FluxNode {_RenderAppVersion()}</span>
              {arcaneHumanVersion && <span className="footer-meta__sep">·</span>}
              {arcaneHumanVersion && <span>{arcaneHumanVersion}</span>}
              {/*
                #145: where this instance is running and how long it has been
                up. Empty unless the Rust API is deployed, in which case the
                footer is unchanged.
              */}
              {hostSegments.map(({ kind, text }) => (
                <React.Fragment key={kind}>
                  <span className="footer-meta__sep">·</span>
                  <span className={`footer-meta__host footer-meta__host--${kind}`}>{text}</span>
                </React.Fragment>
              ))}
              {lastUpdated && <span className="footer-meta__sep">·</span>}
              {lastUpdated && (
                <span className="footer-meta__updated">
                  Updated{' '}
                  {lastUpdated.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </span>
              )}
            </span>
          </div>

          <div className="footer-bar__right">
            <span className="footer-donate-label">Support development</span>
            <div className="footer-chips">
              <DonateChip label="FLUX" address={ADDRESS_FLUX} />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

export const FooterRendered = <Footer />;
