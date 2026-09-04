import React from 'react';
import './Application.scss';

import { initStore } from 'persistance/store';
import reportWebVitals from './reportWebVitals';

import { Spinner } from '@blueprintjs/core';
import { FooterRendered } from 'components/Footer';
import { AppNavbar } from 'components/Navbar';
import { ScreenClassProvider, setConfiguration as setGridConfiguration } from 'react-grid-system';
import { Helmet } from 'react-helmet';
import { Navigate, Route, Routes } from 'react-router-dom';

import LayoutConfigurationProvider from 'contexts/LayoutContext';
import { DonorProvider } from 'contexts/DonorContext';
import { DonorContext } from 'contexts/DonorContext';
import { FocusStyleManager } from '@blueprintjs/core';
import { lazy_load_currency_rate } from 'main/apidata';
import ErrorBoundary from 'components/ErrorBoundary';
import { PremiumGate } from 'donor/PremiumGate';

const MainApp = React.lazy(() => import('main/MainApp'));
const Home = React.lazy(() => import('home/Home'));
const Demo = React.lazy(() => import('demo/Demo'));
const Live = React.lazy(() => import('live/Live'));
const Analytics = React.lazy(() => import('analytics/Analytics'));
const NotFoundView = React.lazy(() => import('notfound/index'));

// Omit round border of switches - https://blueprintjs.com/docs/#core/accessibility.focus-management
FocusStyleManager.onlyShowFocusOnTabs();

setGridConfiguration({
  gridColumns: 24,
  gutterWidth: 20,
  maxScreenClass: 'xxl'
});

initStore();

function PageLoader() {
  return (
    <div className='center-everything w-100 h-100'>
      <Spinner size={130} intent='danger' />
    </div>
  );
}


const DARK_MODE_CLASS = 'app-mode-dark bp4-dark';

function getStartupTheme() {
  let themeValue = localStorage && localStorage.getItem('appTheme');

  if (themeValue == null) {
    themeValue = 'dark';
    localStorage.setItem('appTheme', themeValue);
  }

  return themeValue;
}

class Application extends React.Component {
  constructor(props) {
    super(props);

    const theme = getStartupTheme();
    this.state = {
      darkMode: theme == 'dark',
      currencyRates: { USD: 1 }
    };

    
  }

  async componentDidMount() {
    document.body.classList.remove('app-mode-dark');
    // Only replace the default when we actually got rates. This used to write
    // the result straight into state, so a failed fetch (which returned null)
    // wiped the { USD: 1 } default and left the currency menu stuck on USD for
    // the rest of the session, with no retry and no error shown.
    try {
      const currencyRates = await lazy_load_currency_rate();
      if (currencyRates && Object.keys(currencyRates).length > 0) {
        this.setState({ currencyRates });
      }
    } catch (error) {
      console.warn('[currency] could not load rates, keeping USD default:', error?.message);
    }
  }

  setDarkMode(enable) {
    if (enable) {
      this.setState({ darkMode: true });
      localStorage.setItem('appTheme', 'dark');
    } else {
      this.setState({ darkMode: false });
      localStorage.setItem('appTheme', 'light');
    }
  }

  render() {
    const { darkMode, currencyRates } = this.state;

    return (
      <ScreenClassProvider>
        <LayoutConfigurationProvider>
        <DonorProvider>
          <Helmet defaultTitle='FluxNode' titleTemplate='%s | FluxNode'>
            <meta charSet='utf-8' />
            <meta name='description' content='Overview for flux node wallets' />
          </Helmet>
          <div className={'App' + (darkMode ? ' ' + DARK_MODE_CLASS : '')}>
            
              <AppNavbar
                theme={darkMode ? 'dark' : 'light'}
                onThemeSwitch={() => this.setDarkMode(!darkMode)}
                currencyRates={currencyRates}
              />
              <div className='app-routed-content'>
              <Routes>
                <Route exact path='/' element={<Navigate to='/home' replace />} />

                <Route
                  path='/home'
                  element={
                    <ErrorBoundary>
                      <React.Suspense fallback={<PageLoader />}>
                        <Home theme={darkMode ? 'dark' : 'light'} />
                      </React.Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path='/nodes'
                  element={
                    <ErrorBoundary>
                      <React.Suspense fallback={<PageLoader />}>
                        <DonorContext.Consumer>
                          {({ donorWallet }) => (
                            <MainApp theme={darkMode ? 'dark' : 'light'} donorWallet={donorWallet} />
                          )}
                        </DonorContext.Consumer>
                      </React.Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path='/demo'
                  element={
                    <ErrorBoundary>
                      <React.Suspense fallback={<PageLoader />}>
                        <Demo theme={darkMode ? 'dark' : 'light'} />
                      </React.Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path='/live'
                  element={
                    <ErrorBoundary>
                      <React.Suspense fallback={<PageLoader />}>
                        <PremiumGate feature='Live'>
                          <Live />
                        </PremiumGate>
                      </React.Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path='/analytics'
                  element={
                    <ErrorBoundary>
                      <React.Suspense fallback={<PageLoader />}>
                        <PremiumGate feature='Analytics'>
                          <Analytics />
                        </PremiumGate>
                      </React.Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path='*'
                  element={
                    <React.Suspense fallback={<PageLoader />}>
                      <NotFoundView />
                    </React.Suspense>
                  }
                />
              </Routes>
              </div>
              {FooterRendered}
          </div>
        </DonorProvider>
        </LayoutConfigurationProvider>
      </ScreenClassProvider>
    );
  }
}

export default Application;

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
