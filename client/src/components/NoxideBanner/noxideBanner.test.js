import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NoxideBanner } from './index';
import {
  CUTOVER_AT,
  DISMISSED_AT_KEY,
  DISMISS_FOR_MS,
  noxideUrlFor,
  shouldShowBanner,
  timeLeftLabel
} from './noxideTransition';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe('noxideTransition', () => {
  it('cuts over at 00:00 UTC on 1 November 2026', () => {
    expect(new Date(CUTOVER_AT).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('counts down in days, then hours, then nothing after the cutover', () => {
    expect(timeLeftLabel(CUTOVER_AT - 29 * DAY - HOUR)).toBe('29 days left');
    expect(timeLeftLabel(CUTOVER_AT - DAY - HOUR)).toBe('1 day left');
    expect(timeLeftLabel(CUTOVER_AT - 5 * HOUR - 1)).toBe('5 hours left');
    expect(timeLeftLabel(CUTOVER_AT - HOUR)).toBe('1 hour left');
    expect(timeLeftLabel(CUTOVER_AT - 60 * 1000)).toBe('less than an hour left');
    expect(timeLeftLabel(CUTOVER_AT)).toBeNull();
  });

  it('respects a dismissal for three days, but not in the final week', () => {
    const early = CUTOVER_AT - 20 * DAY;
    expect(shouldShowBanner(early, null)).toBe(true);
    expect(shouldShowBanner(early, early - HOUR)).toBe(false);
    expect(shouldShowBanner(early, early - DISMISS_FOR_MS)).toBe(true);

    const finalWeek = CUTOVER_AT - 6 * DAY;
    expect(shouldShowBanner(finalWeek, finalWeek - HOUR)).toBe(true);
  });

  it('disappears once the cutover has passed', () => {
    expect(shouldShowBanner(CUTOVER_AT, null)).toBe(false);
  });

  it('links to the same view on Noxide, keeping the wallet', () => {
    const wallet = '?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ';
    expect(noxideUrlFor('/nodes', wallet)).toBe(`https://noxide.app.runonflux.io/nodes${wallet}`);
    expect(noxideUrlFor('/home', wallet)).toBe(`https://noxide.app.runonflux.io/${wallet}`);
    expect(noxideUrlFor('/live', '')).toBe('https://noxide.app.runonflux.io/');
    expect(noxideUrlFor('/analytics', '', '#chain')).toBe('https://noxide.app.runonflux.io/analytics#chain');
    expect(noxideUrlFor('', '')).toBe('https://noxide.app.runonflux.io/');
  });
});

describe('<NoxideBanner />', () => {
  beforeEach(() => window.localStorage.clear());

  function renderAt(path, now) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <NoxideBanner now={now} />
      </MemoryRouter>
    );
  }

  it('shows the countdown and a beta link for the current page', () => {
    renderAt('/nodes?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ', CUTOVER_AT - 10 * DAY - HOUR);
    screen.getByText(/new, faster engine on 1 November/i);
    screen.getByText('(10 days left)');
    screen.getByText(/try the beta \(noxide\) and tell us what is missing/i);
    const link = screen.getByRole('link', { name: /try the noxide beta/i });
    expect(link.getAttribute('href')).toBe(
      'https://noxide.app.runonflux.io/nodes?wallet=t3c4EfxLoXXSRZCRnPRF3RpjPi9mBzF5yoJ'
    );
    expect(screen.getByRole('link', { name: /report a problem/i }).getAttribute('href')).toBe(
      'https://github.com/2ndtlmining/Fluxnode/issues'
    );
  });

  it('hides when dismissed and remembers it', () => {
    const { container } = renderAt('/home', CUTOVER_AT - 20 * DAY);
    fireEvent.click(screen.getByRole('button', { name: /hide for 3 days/i }));
    expect(container.querySelector('.noxide-banner')).toBeNull();
    expect(window.localStorage.getItem(DISMISSED_AT_KEY)).not.toBeNull();
  });

  it('cannot be dismissed in the final week', () => {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(CUTOVER_AT - 6 * DAY - HOUR));
    const { container } = renderAt('/home', CUTOVER_AT - 6 * DAY);
    expect(container.querySelector('.noxide-banner-final')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /hide/i })).toBeNull();
  });

  it('renders nothing after the cutover', () => {
    const { container } = renderAt('/home', CUTOVER_AT + HOUR);
    expect(container.firstChild).toBeNull();
  });
});
