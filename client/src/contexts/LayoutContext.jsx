import React, { createContext } from 'react';
import { StoreKeys, appStore } from 'persistance/store';

export const LayoutContext = createContext(null);

class LayoutConfigurationProvider extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      enableEstimatedEarningsTab: true,
      enableParallelAssetsTab: true,
      normalFontSize: true,
      enablePrivacyMode: false
    }

    this.setEstimatedEarningsTab = this.setEstimatedEarningsTab.bind(this);
    this.setParallelAssetsTab = this.setParallelAssetsTab.bind(this);
    this.setFontSize = this.setFontSize.bind(this);
    this.setPrivacyMode = this.setPrivacyMode.bind(this);

    appStore.setItem(StoreKeys.PRIVACY_MODE, this.state.enablePrivacyMode)

    this.appStore = appStore;
  }

  setEstimatedEarningsTab() {
    //TODO: replace with persistence/store
    this.setState((prevState) => ({ enableEstimatedEarningsTab: !prevState.enableEstimatedEarningsTab }));
    localStorage.setItem('estimatedEarnings', this.state.enableEstimatedEarningsTab);
  }

  setParallelAssetsTab() {
    //TODO: replace with persistence/store
    this.setState((prevState) => ({ enableParallelAssetsTab: !prevState.enableParallelAssetsTab }));
    localStorage.setItem('parallelAssets', this.state.enableParallelAssetsTab);
  }

  setFontSize() {
    this.setState((prevState) => ({ normalFontSize: !prevState.normalFontSize }));
    //TODO: replace with persistence/store
    localStorage.setItem('parallelAssets', this.state.normalFontSize);
  }

  setPrivacyMode() {
    this.setState((prevState) => {
      try {
        this.appStore.setItem(StoreKeys.PRIVACY_MODE, !this.state.enablePrivacyMode);
      } catch { }
      return { ...prevState, enablePrivacyMode: !prevState.enablePrivacyMode }
    });

  }

  render() {
    return (
      <LayoutContext.Provider
        value={{
          ...this.state,
          onToggleEstimatedEarningsTab: this.setEstimatedEarningsTab,
          onToggleParallelAssetsTab: this.setParallelAssetsTab,
          onToggleChangeFontSize: this.setFontSize,
          onTogglePrivacyMode: this.setPrivacyMode
        }}
      >
        {this.props.children}
      </LayoutContext.Provider>
    );
  }
}

export default LayoutConfigurationProvider;
