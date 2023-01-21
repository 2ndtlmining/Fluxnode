import React, { createContext, useCallback, useMemo } from 'react';
import { StoreKeys, appStore } from 'persistance/store';
import { useState } from 'react';

export const LayoutContext = createContext(null);

export function LayoutConfigurationProvider(props) {
  const [enableEstimatedEarningsTab, setEstimatedEarningsTab] = useState(true);
  const [enableParallelAssetsTab, setParallelAssetsTab] = useState(true);
  const [normalFontSize, setFontSize] = useState(true);
  const [enablePrivacyMode, setPrivacyMode] = useState(false);
  const [enableDashboardCells, setDashboardCells] = useState(true);
  const [enableNotableNodesTab, setNotableNodesTab] = useState(false);

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
      } catch {}
      return !prevState;
    });
  }, [setPrivacyMode]);

  const toggleDashboardCells = useCallback(() => {
    setDashboardCells((prevState) => !prevState);
    //TODO: replace with persistence/store
    localStorage.setItem('header', enableDashboardCells);
  }, [setDashboardCells]);

  const toggleNotableNodesTab = useCallback(() => {
    setNotableNodesTab((prevState) => !prevState);
    //TODO: replace with persistence/store
    localStorage.setItem('notableNodes', enableNotableNodesTab);
  }, [setNotableNodesTab]);

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
          onToggleEstimatedEarningsTab: toggleEstimatedEarningsTab,
          onToggleParallelAssetsTab: toggleParallelAssetsTab,
          onToggleChangeFontSize: toggleFontSize,
          onTogglePrivacyMode: togglePrivacyMode,
          onToggleDashboardCells: toggleDashboardCells,
          onToggleNotableNodesTab: toggleNotableNodesTab
        }),
        [
          enableEstimatedEarningsTab,
          enableParallelAssetsTab,
          normalFontSize,
          enablePrivacyMode,
          enableDashboardCells,
          enableNotableNodesTab,
          toggleEstimatedEarningsTab,
          toggleParallelAssetsTab,
          toggleFontSize,
          togglePrivacyMode,
          toggleDashboardCells,
          toggleNotableNodesTab
        ]
      )}
    >
      {props.children}
    </LayoutContext.Provider>
  );
}

export default LayoutConfigurationProvider;
