import React from 'react';
import { useLocation } from 'react-router-dom';
import { FiExternalLink, FiX, FiZap } from 'react-icons/fi';
import './index.scss';

import {
  FEEDBACK_ISSUES_URL,
  isFinalWeek,
  noxideUrlFor,
  readDismissedAt,
  shouldShowBanner,
  timeLeftLabel,
  writeDismissedAt
} from './noxideTransition';

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Sitewide notice that FluxNode becomes Noxide on 1 November, with a link to
 * the Noxide beta for the page being viewed. `now` is injectable for tests.
 */
export function NoxideBanner({ now: fixedNow }) {
  const location = useLocation();
  const [now, setNow] = React.useState(() => fixedNow ?? Date.now());
  const [dismissedAt, setDismissedAt] = React.useState(() => readDismissedAt(safeStorage()));

  React.useEffect(() => {
    if (fixedNow != null) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, [fixedNow]);

  if (!shouldShowBanner(now, dismissedAt)) return null;

  const finalWeek = isFinalWeek(now);
  const href = noxideUrlFor(location.pathname, location.search, location.hash);

  const dismiss = () => {
    writeDismissedAt(safeStorage(), now);
    setDismissedAt(now);
  };

  return (
    <div className={'noxide-banner' + (finalWeek ? ' noxide-banner-final' : '')} role='status'>
      <FiZap className='noxide-banner-icon' aria-hidden='true' />
      <div className='noxide-banner-body'>
        <span className='noxide-banner-title'>
          FluxNode is getting a new, faster engine on 1 November
        </span>{' '}
        <span className='noxide-banner-countdown'>({timeLeftLabel(now)})</span>
        <span className='noxide-banner-text'>. Try the beta (Noxide) and tell us what is missing.</span>
      </div>
      <div className='noxide-banner-actions'>
        <a className='noxide-banner-cta' href={href} target='_blank' rel='noopener noreferrer'>
          Try the Noxide beta <FiExternalLink aria-hidden='true' />
        </a>
        <a className='noxide-banner-feedback' href={FEEDBACK_ISSUES_URL} target='_blank' rel='noopener noreferrer'>
          Report a problem
        </a>
        {!finalWeek && (
          <button type='button' className='noxide-banner-dismiss' onClick={dismiss} aria-label='Hide for 3 days'>
            <FiX aria-hidden='true' />
          </button>
        )}
      </div>
    </div>
  );
}

export default NoxideBanner;
