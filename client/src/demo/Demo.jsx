import MainApp from 'main/MainApp';
import React from 'react';
import { AppToaster } from 'main/AppToaster';
import { Intent, Spinner } from '@blueprintjs/core';
import { getDemoWallet } from '../main/apidata';
import FailedToLoadDemo from './FailedToLoadDemo';
import { setGAEvent, setGAPageView } from 'g-analytic';

class Demo extends React.Component {
  constructor(props) {
    super(props);
    window.Demo = this;
    this.state = {
      demoWallet: null,
      isAddressLoading: true
    };
    this.showToast();
  }
  async componentDidMount() {
    const demoWalletRes = await getDemoWallet();
    if (demoWalletRes) {
      this.setState({
        demoWallet: demoWalletRes,
        isAddressLoading: false
      });
    }
    if (window) {
      setGAEvent({ category: 'Demo page', action: 'visit' });
      setGAPageView(window.location.pathname);
    }
  }

  showToast = () => {
    AppToaster.show({
      message: 'You are in Demo Mode',
      intent: Intent.WARNING,
      icon: 'build'
    });
  };

  renderContent() {
    const hasValidWalletAddress = this.state.demoWallet?.success === true && this.state.demoWallet?.address;
    return (
      <>
        {hasValidWalletAddress ? (
          <MainApp defaultAddress={this.state.demoWallet?.address} />
        ) : (
          <FailedToLoadDemo errorCode={this.state.demoWallet ? "404" : this.state.demoWallet?.errorCode } errorMsg="Failed to load the demo wallet"/>
        )}
      </>
    );
  }

  render() {    
    return (
      <>
        {this.state.isAddressLoading ? (
          <div style={{ height: '100vh' }} className='d-flex justify-content-center'>
            <Spinner intent='primary' size={150} />
          </div>
        ) : (
          this.renderContent()
        )}
      </>
    );
  }
}

export default Demo;
