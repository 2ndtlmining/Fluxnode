import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isPremiumTestingUnlocked } from 'donor/config';
import { fetch_donor_status } from 'donor/donorStatus';

export const DonorContext = createContext(null);

const DONOR_WALLET_STORAGE_KEY = 'donorWallet';

function readStoredWallet() {
  try {
    return localStorage.getItem(DONOR_WALLET_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/*
 * Gates premium features (currently /live). `isUnlocked` is true when either
 * the PREMIUM_TESTING_MODE flag is set (see donor/config.js) OR a verified
 * donor wallet is active — the testing flag is an override on top of real
 * verification, not a replacement for it.
 *
 * `donorWallet` restores from localStorage on mount so unlock survives a
 * reload; the restored wallet is then re-verified via fetch_donor_status
 * (which has its own shorter-lived cache, so this is usually instant, not a
 * fresh network round trip every load).
 */
export function DonorProvider({ children }) {
  const [donorWallet, setDonorWalletState] = useState(readStoredWallet);
  const [donorStatus, setDonorStatus] = useState(null);

  const refreshDonorStatus = useCallback(async () => {
    if (!donorWallet) {
      setDonorStatus(null);
      return null;
    }
    const status = await fetch_donor_status(donorWallet);
    setDonorStatus(status);
    return status;
  }, [donorWallet]);

  // Sets the active wallet. If the caller already has a fresh status result
  // (DonorUnlockDialog does, from its own verification check), pass it as
  // `status` to avoid a redundant re-fetch; otherwise this schedules one via
  // the effect below.
  const setDonorWallet = useCallback((address, status = null) => {
    setDonorWalletState(address);
    try {
      if (address) localStorage.setItem(DONOR_WALLET_STORAGE_KEY, address);
      else localStorage.removeItem(DONOR_WALLET_STORAGE_KEY);
    } catch {
      // localStorage unavailable — unlock just won't survive a reload this session
    }
    setDonorStatus(status);
  }, []);

  useEffect(() => {
    if (donorWallet && !donorStatus) refreshDonorStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorWallet]);

  const isUnlocked = isPremiumTestingUnlocked() || donorStatus?.isDonor === true;

  const value = useMemo(() => ({
    isUnlocked, donorWallet, donorStatus, setDonorWallet, refreshDonorStatus,
  }), [isUnlocked, donorWallet, donorStatus, setDonorWallet, refreshDonorStatus]);

  return <DonorContext.Provider value={value}>{children}</DonorContext.Provider>;
}

export function useDonorStatus() {
  return useContext(DonorContext);
}
