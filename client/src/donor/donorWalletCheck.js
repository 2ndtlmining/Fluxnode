import { validateAddress } from 'apidata';
import { fetch_donor_status } from './donorStatus';

/*
 * Framework-agnostic verification core, extracted from what
 * DonorUnlockDialog's handleCheck used to do inline. Deliberately not a
 * hook and doesn't touch DonorContext itself — every caller (the
 * useDonorWalletCheck hook for function components, the
 * runDonorAutoDetect helper for the two legacy class components) decides
 * what to do with the result, including whether/how to call
 * setDonorWallet. This is what makes the same verification logic usable
 * from Home.jsx/MainApp.jsx, which can't call hooks.
 */
export const CHECK_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  SUCCESS: 'success',
  FAILURE: 'failure',
  INVALID: 'invalid',
  UNVERIFIED: 'unverified',
};

/*
 * `forceRefresh` is passed straight to fetch_donor_status. Callers that
 * represent a deliberate "check my donation now" (the unlock dialog) set it;
 * callers where donor status is a side-effect of some other lookup
 * (runDonorAutoDetect) leave it off and accept a cached answer. See issue #360.
 */
export async function checkDonorWallet(address, { forceRefresh = false } = {}) {
  const trimmed = (address || '').trim();
  if (!trimmed) return { status: CHECK_STATUS.INVALID, result: null };

  const looksReal = await validateAddress(trimmed);
  if (!looksReal) return { status: CHECK_STATUS.INVALID, result: null };

  const result = await fetch_donor_status(trimmed, { forceRefresh });
  if (result.isDonor) return { status: CHECK_STATUS.SUCCESS, result };
  if (!result.verified) return { status: CHECK_STATUS.UNVERIFIED, result };
  return { status: CHECK_STATUS.FAILURE, result };
}
