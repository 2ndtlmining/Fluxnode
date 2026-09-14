import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useDonorWalletCheck } from './useDonorWalletCheck';
import { runDonorAutoDetect } from './runDonorAutoDetect';
import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';
import { DonorContext } from 'contexts/DonorContext';

jest.mock('./donorWalletCheck', () => ({
  checkDonorWallet: jest.fn(),
  CHECK_STATUS: jest.requireActual('./donorWalletCheck').CHECK_STATUS
}));

/*
 * Issue #360. Which entry points bypass the donor-status cache is the whole
 * fix, so it is pinned here rather than left to the one-line call sites.
 *
 * The distinction is intent, not caller type: clicking "Check" in the unlock
 * dialog means "I just donated, look again" and must hit the chain. Searching a
 * wallet to see its nodes happens to also check donor status as a side effect,
 * and has no reason to spend an uncached explorer scan on it.
 */
describe('cache bypass on explicit donor checks (issue #360)', () => {
  beforeEach(() => {
    checkDonorWallet.mockReset();
    checkDonorWallet.mockResolvedValue({ status: CHECK_STATUS.FAILURE, result: { isDonor: false } });
  });

  function wrapper({ children }) {
    return <DonorContext.Provider value={{ setDonorWallet: jest.fn() }}>{children}</DonorContext.Provider>;
  }

  it('the unlock dialog check forces a fresh chain read', async () => {
    const { result } = renderHook(() => useDonorWalletCheck(), { wrapper });

    await act(async () => {
      await result.current.check('t1RealAddress');
    });

    expect(checkDonorWallet).toHaveBeenCalledWith('t1RealAddress', { forceRefresh: true });
  });

  it('background auto-detect stays on the cached path', async () => {
    await runDonorAutoDetect('t1RealAddress', { setDonorWallet: jest.fn() });

    // Called without forceRefresh — a cached answer is fine here.
    expect(checkDonorWallet).toHaveBeenCalledWith('t1RealAddress');
  });
});
