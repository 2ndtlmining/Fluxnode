import React, { createContext, useContext, useMemo } from 'react';
import { isPremiumTestingUnlocked } from 'donor/config';

export const DonorContext = createContext(null);

/*
 * Gates premium features (currently just /live). Shaped to match what
 * PREMIUM_FEATURES_PLAN.md specs out for the real donor-check mechanism
 * (donorWallet, donorStatus, setDonorWallet, refreshDonorStatus) so that
 * work slots in here later without changing any consumer of this context —
 * for now, `isUnlocked` only ever reflects the PREMIUM_TESTING_MODE flag,
 * since there is no real wallet verification yet.
 */
export function DonorProvider({ children }) {
  const isUnlocked = isPremiumTestingUnlocked();

  const value = useMemo(() => ({
    isUnlocked,
    donorWallet: null,
    donorStatus: null,
    // Placeholders — real implementations land with the donor-check build.
    setDonorWallet: () => {},
    refreshDonorStatus: async () => {},
  }), [isUnlocked]);

  return <DonorContext.Provider value={value}>{children}</DonorContext.Provider>;
}

export function useDonorStatus() {
  return useContext(DonorContext);
}
