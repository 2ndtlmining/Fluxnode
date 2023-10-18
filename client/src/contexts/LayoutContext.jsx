import React, { createContext, useCallback, useEffect, useMemo } from 'react';
import { StoreKeys, appStore } from 'persistance/store';
import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { hide_sensitive_string } from 'utils';

export const LayoutContext = createContext(null);

export function LayoutConfigurationProvider(props) {

  const [enableEstimatedEarningsTab, setEstimatedEarningsTab] = useState(true);
  const [enableParallelAssetsTab, setParallelAssetsTab] = useState(true);
  const [normalFontSize, setFontSize] = useState(true);
  const [enablePrivacyMode, setPrivacyMode] = useState(false);
  const [enableDashboardCells, setDashboardCells] = useState(true);
  const location = useLocation()





  const savedNotableNodes = appStore.getItem(StoreKeys.NOTABLE_NODES);
  const [enableNotableNodesTab, setNotableNodesTab] = useState(savedNotableNodes);

  const defaultCurrency = { currency: 'USD', rate: 1 };
  const savedSelectedCurrency = JSON.parse(localStorage.getItem('selectedCurrency'));
  const [selectedCurrency, setSelectedCurrency] = useState(savedSelectedCurrency ?? defaultCurrency);

  appStore.setItem(StoreKeys.PRIVACY_MODE, enablePrivacyMode);

  const toggleEstimatedEarningsTab = useCallback(() => {
    //TODO: replace with persistence/store
    setEstimatedEarningsTab((prevState) => !prevState);
    localStorage.setItem('estimatedEarnings', enableEstimatedEarningsTab);
  }, [setEstimatedEarningsTab]);

  const toggleParallelAssetsTab = useCallback(() => {
    //TODO: replace with persistence/store
    setParallelAssetsTab((prevState) => !prevState);
    localStorage.setItem('parallelAssets', enableParallelAssetsTab);
  }, [setParallelAssetsTab]);

  const toggleFontSize = useCallback(() => {
    //TODO: replace with persistence/store
    setFontSize((prevState) => !prevState);
    localStorage.setItem('fontSize', normalFontSize);
  }, [setFontSize]);

  const togglePrivacyMode = useCallback(() => {
    setPrivacyMode((prevState) => {
      try {
        appStore.setItem(StoreKeys.PRIVACY_MODE, !this.state.enablePrivacyMode);
      } catch { }
      return !prevState;
    });
  }, [setPrivacyMode]);


  // 


  useEffect(() => {
    const getLocation = () => {
      if (location.pathname !== '/nodes') return
      const baseUrl = window.location.origin
      const searchQuery = new URLSearchParams(location.search)
      const wallet = searchQuery.get('wallet')

      let url = !enablePrivacyMode ? `${baseUrl}/#${location.pathname}?wallet=${wallet}` : `${baseUrl}/#${location.pathname}?wallet=${hide_sensitive_string(wallet)}`
      window.history.pushState({}, '', url);


    }

    getLocation()

  }, [location, enablePrivacyMode])







  const toggleDashboardCells = useCallback(() => {
    setDashboardCells((prevState) => !prevState);
    //TODO: replace with persistence/store
    localStorage.setItem('header', enableDashboardCells);
  }, [setDashboardCells]);

  const toggleNotableNodesTab = useCallback(() => {
    setNotableNodesTab((prevState) => {
      try {
        appStore.setItem(StoreKeys.NOTABLE_NODES, !prevState);
      } catch { }
      return !prevState;
    });
  }, [setNotableNodesTab]);

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
