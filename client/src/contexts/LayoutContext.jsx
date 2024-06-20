import React, { createContext, useCallback, useEffect, useMemo } from 'react';
import { StoreKeys, appStore } from 'persistance/store';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { hide_sensitive_string } from 'utils';

export const LayoutContext = createContext(null);

export function LayoutConfigurationProvider(props) {

  const getLocalStorageValue = (key, defaultValue) => {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : defaultValue;
  };


  const [enableEstimatedEarningsTab, setEstimatedEarningsTab] = useState(() => getLocalStorageValue('enableEstimatedEarningsTab', true));
  const [enableParallelAssetsTab, setParallelAssetsTab] = useState(() => getLocalStorageValue('enableParallelAssetsTab', true));
  const [normalFontSize, setFontSize] = useState(() => getLocalStorageValue('normalFontSize', true));
  const [enablePrivacyMode, setPrivacyMode] = useState(() => getLocalStorageValue('enablePrivacyMode', false));
  const [enableDashboardCells, setDashboardCells] = useState(() => getLocalStorageValue('enableDashboardCells', true));
  const [enableNotableNodesTab, setNotableNodesTab] = useState(() => getLocalStorageValue('enableNotableNodesTab', true))
  const location = useLocation()



  const defaultCurrency = { currency: 'USD', rate: 1 };
  const savedSelectedCurrency = JSON.parse(localStorage.getItem('selectedCurrency'));
  const [selectedCurrency, setSelectedCurrency] = useState(savedSelectedCurrency ?? defaultCurrency);

  appStore.setItem(StoreKeys.PRIVACY_MODE, enablePrivacyMode);

  // ================================================================
  // Toggle Functionalities & Persistence
  // ================================================================
  const toggleEstimatedEarningsTab = () => {
    setEstimatedEarningsTab((prevState) => !prevState);
  }
  useEffect(() => {
    localStorage.setItem('enableEstimatedEarningsTab', JSON.stringify(enableEstimatedEarningsTab));
  }, [enableEstimatedEarningsTab])


  const toggleParallelAssetsTab = () => {
    setParallelAssetsTab((prevState) => !prevState);
  }

  useEffect(() => {
    localStorage.setItem('enableParallelAssetsTab', JSON.stringify(enableParallelAssetsTab));
  }, [enableParallelAssetsTab]);


  const toggleFontSize = () => {
    setFontSize((prevState) => !prevState);
  }
  useEffect(() => {
    localStorage.setItem('normalFontSize', JSON.stringify(normalFontSize));
  }, [normalFontSize]);



  const togglePrivacyMode = () => {
    setPrivacyMode((prevState) => !prevState);
  }

  useEffect(() => {
    localStorage.setItem('enablePrivacyMode', JSON.stringify(enablePrivacyMode));
  }, [enablePrivacyMode]);


  useEffect(() => {

    const updateUrl = (wallet) => {
      const baseUrl = window.location.origin;
      const mainUrl = `${baseUrl}/#${location.pathname}?wallet=${wallet}`;
      const hiddenUrl = `${baseUrl}/#${location.pathname}?wallet=${hide_sensitive_string(wallet)}`;

      if (!enablePrivacyMode) {
        window.history.replaceState({}, '', mainUrl);
      } else {
        window.history.replaceState({}, '', hiddenUrl);
      }
    };

    const getLocation = () => {
      if (location.pathname !== '/nodes') return;

      const searchQuery = new URLSearchParams(location.search);
      let wallet = searchQuery.get('wallet');

      if (!wallet) {
        wallet = sessionStorage.getItem('wallet');
        if (wallet) {
          updateUrl(wallet);
        }
      } else {
        sessionStorage.setItem('wallet', wallet); // Store the actual wallet address in sessionStorage
        updateUrl(wallet);
      }
    };

    getLocation();
  }, [location, enablePrivacyMode]);



  const toggleDashboardCells = () => {
    setDashboardCells((prevState) => !prevState);
  }
  useEffect(() => {
    localStorage.setItem('enableDashboardCells', JSON.stringify(enableDashboardCells));
  }, [enableDashboardCells]);


  const toggleNotableNodesTab = () => {
    setNotableNodesTab((prevState) => !prevState);
  }
  useEffect(() => {
    localStorage.setItem('enableNotableNodesTab', JSON.stringify(enableNotableNodesTab));
  }, [enableNotableNodesTab]);



  const onSelectCurrency = useCallback(
    (val) => {
      setSelectedCurrency(val);
      localStorage.setItem('selectedCurrency', JSON.stringify(val));
    },
    [setSelectedCurrency]
  );

  return (
    <LayoutContext.Provider
      value={useMemo(
        () => ({
          enableEstimatedEarningsTab,
          enableParallelAssetsTab,
          normalFontSize,
          enablePrivacyMode,
          enableDashboardCells,
          enableNotableNodesTab,
          selectedCurrency,
          onToggleEstimatedEarningsTab: toggleEstimatedEarningsTab,
          onToggleParallelAssetsTab: toggleParallelAssetsTab,
          onToggleChangeFontSize: toggleFontSize,
          onTogglePrivacyMode: togglePrivacyMode,
          onToggleDashboardCells: toggleDashboardCells,
          onToggleNotableNodesTab: toggleNotableNodesTab,
          onSelectCurrency: onSelectCurrency
        }),
        [
          enableEstimatedEarningsTab,
          enableParallelAssetsTab,
          normalFontSize,
          enablePrivacyMode,
          enableDashboardCells,
          enableNotableNodesTab,
          selectedCurrency,
          toggleEstimatedEarningsTab,
          toggleParallelAssetsTab,
          toggleFontSize,
          togglePrivacyMode,
          toggleDashboardCells,
          toggleNotableNodesTab,
          onSelectCurrency
        ]
      )}
    >
      {props.children}
    </LayoutContext.Provider>
  );
}

export default LayoutConfigurationProvider;
