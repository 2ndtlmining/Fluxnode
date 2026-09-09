import { useCallback, useState } from 'react';
import { useDonorStatus } from 'contexts/DonorContext';
import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';

/*
 * Function-component wrapper around checkDonorWallet. On a qualifying
 * result, hands it straight to DonorContext.setDonorWallet so the caller
 * (DonorContext already has its own fresh result — Task 1's docstring)
 * doesn't re-fetch what this just fetched.
 */
export function useDonorWalletCheck() {
  const { setDonorWallet } = useDonorStatus();
  const [status, setStatus] = useState(CHECK_STATUS.IDLE);
  const [result, setResult] = useState(null);

  const check = useCallback(async (address) => {
    setStatus(CHECK_STATUS.CHECKING);
    setResult(null);
    const { status: nextStatus, result: nextResult } = await checkDonorWallet(address);
    setResult(nextResult);
    setStatus(nextStatus);
    if (nextStatus === CHECK_STATUS.SUCCESS) setDonorWallet(address.trim(), nextResult);
    return { status: nextStatus, result: nextResult };
  }, [setDonorWallet]);

  const reset = useCallback(() => {
    setStatus(CHECK_STATUS.IDLE);
    setResult(null);
  }, []);

  return { status, result, check, reset };
}
