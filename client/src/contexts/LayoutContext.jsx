import React, { createContext } from 'react';

export const LayoutContext = createContext(null);

class LayoutConfigurationProvider extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      enableEstimatedEarningsTab: true,
      enableParallelAssetsTab: true,
      normalFontSize: true
    }

    this.setEstimatedEarningsTab = this.setEstimatedEarningsTab.bind(this);
    this.setParallelAssetsTab = this.setParallelAssetsTab.bind(this);
    this.setFontSize = this.setFontSize.bind(this);
  }

  setEstimatedEarningsTab() {
    this.setState((prevState) => ({ ...prevState, enableEstimatedEarningsTab: !prevState.enableEstimatedEarningsTab }));
    localStorage.setItem('estimatedEarnings', this.state.enableEstimatedEarningsTab);
  }

  setParallelAssetsTab() {
    this.setState((prevState) => ({ ...prevState, enableParallelAssetsTab: !prevState.enableParallelAssetsTab }));
    localStorage.setItem('parallelAssets', this.state.enableParallelAssetsTab);
  }

  setFontSize() {
    this.setState((prevState) => ({ ...prevState, normalFontSize: !prevState.normalFontSize }));
    localStorage.setItem('parallelAssets', this.state.normalFontSize);
  }

  render() {
    return (
      <LayoutContext.Provider
        value={{
          ...this.state,
          onToggleEstimatedEarningsTab: this.setEstimatedEarningsTab,
          onToggleParallelAssetsTab: this.setParallelAssetsTab,
          onToggleChangeFontSize: this.setFontSize
        }}
      >
        {this.props.children}
      </LayoutContext.Provider>
    );
  }
}

export default LayoutConfigurationProvider;
