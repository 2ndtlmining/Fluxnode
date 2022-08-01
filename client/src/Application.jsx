import React from 'react';
import ReactDOM from 'react-dom/client';
import './Application.scss';

import reportWebVitals from './reportWebVitals';
import { appStore, initStore } from 'persistance/store';

import { Helmet } from 'react-helmet';
import { AppNavbar } from 'components/Navbar';
import { FooterRendered } from 'components/Footer';
import { ScreenClassProvider, setConfiguration as setGridConfiguration } from 'react-grid-system';
import { Spinner } from '@blueprintjs/core';
import { BrowserRouter, HashRouter, Router, Routes, Route, Navigate } from 'react-router-dom';

import MainApp from 'main/MainApp';
import AppGuidesView from 'guides/GuidesView';
import NotFoundView from 'notfound/index';

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

const AppRouter = HashRouter;

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
      darkMode: theme == 'dark'
    };
  }

  componentDidMount() {
    document.body.classList.remove('app-mode-dark');
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
    const { darkMode } = this.state;

    return (
      <ScreenClassProvider>
        <Helmet defaultTitle='FluxNode' titleTemplate='%s | FluxNode'>
          <meta charSet='utf-8' />
          <meta name='description' content='Overview for flux node wallets' />
        </Helmet>
        <div className={'App' + (darkMode ? ' ' + DARK_MODE_CLASS : '')}>
          <AppRouter>
            <AppNavbar theme={darkMode ? 'dark' : 'light'} onThemeSwitch={() => this.setDarkMode(!darkMode)} />
            <Routes>
              <Route exact path='/' element={<Navigate to='/nodes' replace />} />

              <Route
                path='/nodes'
                element={
                  <React.Suspense fallback={<PageLoader />}>
                    <MainApp />
                  </React.Suspense>
                }
              />
              <Route
                path='/guide'
                element={
                  <React.Suspense fallback={<PageLoader />}>
                    <AppGuidesView />
                  </React.Suspense>
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
            {FooterRendered}
          </AppRouter>
        </div>
      </ScreenClassProvider>
    );
  }
}

export default Application;

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
