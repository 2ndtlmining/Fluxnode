import React, { useContext, useState, useCallback } from 'react';
import './index.scss';

import { IconContext } from 'react-icons';
import { Tooltip2 } from '@blueprintjs/popover2';
import { LayoutContext } from 'contexts/LayoutContext';

import { IoLogoTwitter, IoMailUnread, IoLogoYoutube } from 'react-icons/io5';
import { BsGithub, BsBugFill, BsCheckLg, BsClipboard } from 'react-icons/bs';

import { URL_YOUTUBE, URL_TWITTER, URL_GITHUB, EMAIL, ADDRESS_FLUX } from 'content/index';

import { IS_TEST_BUILD, IS_DEV, APP_VERSION } from 'app-buildinfo';

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

/** "t1abcdef...uvwxyz" — keeps a donation address recognisable without eating a whole row. */
function truncateAddress(address) {
  if (!address || address.length <= 20) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function DonateChip({ label, address }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!address) return;
    try {
      // navigator.clipboard is unavailable over plain http, which some node
      // operators use to reach the site — fall back rather than doing nothing.
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const el = document.createElement('textarea');
        el.value = address;
        el.setAttribute('readonly', '');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the full address is in the tooltip */
    }
  }, [address]);

  if (!address) return null;

  return (
    <Tooltip2
      content={copied ? 'Copied to clipboard' : address}
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
