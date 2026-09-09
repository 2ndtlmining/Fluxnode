import { checkDonorWallet, CHECK_STATUS } from './donorWalletCheck';

/*
 * Plain (non-hook) wrapper around checkDonorWallet for the two legacy
 * class components (Home.jsx, MainApp.jsx) that can't call
 * useDonorWalletCheck. Takes setDonorWallet as a parameter (threaded down
 * as a prop from Application.jsx's DonorContext.Consumer — see Task 5)
 * rather than reading it from context directly. Silent on a
 * non-qualifying result by design: the caller searched this wallet to
 * look up node/earnings data, not to check donor status, so an address
 * that simply isn't a donor shouldn't produce any visible error.
 */
export async function runDonorAutoDetect(address, { setDonorWallet }) {
  const { status, result } = await checkDonorWallet(address);
  if (status === CHECK_STATUS.SUCCESS) setDonorWallet(address.trim(), result);
  return { status, result };
}
