import React from 'react';

import { Navbar, Button, Alignment } from '@blueprintjs/core';

import { matchPath, useMatch } from 'react-router';
import { Link, useNavigate } from 'react-router-dom';

window.matchPath = matchPath;
window.useMatch = useMatch;

function no_op() {}

const APP_LOGO_THEME_LIGHT = '/app-logo.svg';
const APP_LOGO_THEME_DARK = '/app-logo-dark.svg';

export function AppNavbar({ onThemeSwitch, theme }) {
  theme = theme || 'light';
  let navigate = useNavigate();

  const activeProps = { intent: 'danger', outlined: true };
  const inActiveProps = { minimal: true };

  let homeBtnProps = useMatch('/nodes') == null ? inActiveProps : activeProps;
  let guidesBtnProps = useMatch('/guide') == null ? inActiveProps : activeProps;

  if (onThemeSwitch == undefined) onThemeSwitch = no_op;

  return (
    <Navbar className='adp-bg-normal'>
      <Navbar.Group align={Alignment.LEFT}>
        <img className='ms-3' src={theme == 'dark' ? APP_LOGO_THEME_DARK : APP_LOGO_THEME_LIGHT} />
      </Navbar.Group>
      <Navbar.Group align={Alignment.RIGHT} className='me-3'>
        <Button className='margin-r-s' icon='home' text='Home' {...homeBtnProps} onClick={() => navigate('/nodes')} />
        <Button icon='manual' text='Guides' {...guidesBtnProps} onClick={() => navigate('/guide')} />
        <Navbar.Divider />
        <Button
          large
          minimal
          intent='primary'
          icon={theme == 'light' ? 'flash' : 'moon'}
          onClick={() => onThemeSwitch()}
        />
      </Navbar.Group>
    </Navbar>
  );
}
