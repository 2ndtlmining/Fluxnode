import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { ParallelAssets } from './index';
import { pa_summary_full } from 'apidata';

/*
 * Issue #375. Flux ended the Flux-Ergo bridge, so the Parallel Assets section
 * carries a banner and the Ergo card is marked retired. Its figures still
 * render, because snapshot balances and mining rewards remain claimable.
 */
describe('Ergo parallel asset support ended (#375)', () => {
  function renderSection() {
    return render(<ParallelAssets summary={pa_summary_full()} theme='dark' />);
  }

  it('shows the support-ended banner with the Fusion-only claim warning', () => {
    renderSection();
    const banner = screen.getByRole('alert');
    within(banner).getByText(/support for the Ergo parallel asset has ended/i);
    expect(banner.textContent).toContain('1,878,291');
    expect(banner.textContent).toMatch(/inside Fusion only/i);
    const link = within(banner).getByRole('link', { name: /check your snapshot balance/i });
    expect(link.getAttribute('href')).toBe('https://ergo.runonflux.com');
  });

  it('badges only the Ergo card as retired', () => {
    const { container } = renderSection();
    const retired = container.querySelectorAll('.pa-card-retired');
    expect(retired).toHaveLength(1);
    expect(retired[0].textContent).toContain('Ergo');
    expect(screen.getAllByText('Support ended')).toHaveLength(1);
  });
});
