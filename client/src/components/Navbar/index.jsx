import { useState } from 'react';
import './index.scss';

import { Alignment, Button, Menu, Navbar, Switch } from '@blueprintjs/core';

import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { LayoutContext } from 'contexts/LayoutContext';
import { matchPath, useMatch } from 'react-router';
import { useNavigate } from 'react-router-dom';
import { CurrencyMenuItem } from 'components/Navbar/CurrencyMenuItem';

window.matchPath = matchPath;
window.useMatch = useMatch;

function no_op() { }

const APP_LOGO_THEME_LIGHT = '/app-logo.svg';
const APP_LOGO_THEME_DARK = '/app-logo-dark.svg';

export function AppNavbar({ onThemeSwitch, theme, currencyRates }) {
  console.log(currencyRates)
  const [isSettingMenuOpen, setSettingMenuOpen] = useState(false);

  theme = theme || 'light';
  let navigate = useNavigate();

  const activeProps = { intent: 'danger', outlined: true };
  const inActiveProps = { minimal: true };

  let homeBtnProps = useMatch('/home') == null ? inActiveProps : activeProps;
  let nodesBtnProps = useMatch('/nodes') == null ? inActiveProps : activeProps;
  let guidesBtnProps = useMatch('/guide') == null ? inActiveProps : activeProps;
  let demoBtnProps = useMatch('/demo') == null ? inActiveProps : activeProps;

  if (onThemeSwitch == undefined) onThemeSwitch = no_op;

  return (
    <Navbar className='adp-bg-normal'>
      <Navbar.Group align={Alignment.LEFT}>
        <img className='ms-3' src={theme == 'dark' ? APP_LOGO_THEME_DARK : APP_LOGO_THEME_LIGHT} />
      </Navbar.Group>
      <Navbar.Group align={Alignment.RIGHT} className='me-3'>
        <Button className='margin-r-s' icon='home' text='Home' {...homeBtnProps} onClick={() => navigate('/home')} />
        <Button className='margin-r-s' icon='layout-auto' text='Nodes' {...nodesBtnProps} onClick={() => navigate('/nodes')} />
        <Button icon='manual' text='Guides' {...guidesBtnProps} onClick={() => navigate('/guide')} />
        <Button icon='build' text='Demo' {...demoBtnProps} onClick={() => navigate('/demo')} />
        <Navbar.Divider />
        <Button
          large
          minimal
          intent='primary'
          icon={theme == 'light' ? 'flash' : 'moon'}
          onClick={() => onThemeSwitch()}
        />
        <LayoutContext.Consumer>
          {({
            enableEstimatedEarningsTab,
            enableParallelAssetsTab,
            normalFontSize,
            enablePrivacyMode,
            enableDashboardCells,
            enableNotableNodesTab,
            selectedCurrency,
            onToggleEstimatedEarningsTab,
            onToggleParallelAssetsTab,
            onToggleChangeFontSize,
            onTogglePrivacyMode,
            onToggleDashboardCells,
            onToggleNotableNodesTab,
            onSelectCurrency
          }) => (
            <Popover2
              content={
                <Menu shouldDismissPopover={false}>
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        alignIndicator='right'
                        checked={enableEstimatedEarningsTab}
                        label='Estimated Earnings'
                        onChange={onToggleEstimatedEarningsTab}
                      />
                    }
                  />
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        alignIndicator='right'
                        checked={enableParallelAssetsTab}
                        label='Parallel Assets'
                        onChange={onToggleParallelAssetsTab}
                      />
                    }
                  />
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        alignIndicator='right'
                        checked={normalFontSize}
                        label={`Font Size: ${normalFontSize ? 'Normal' : 'Small'}`}
                        onChange={onToggleChangeFontSize}
                      />
                    }
                  />
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        shouldDismissPopover={false}
                        alignIndicator='right'
                        checked={enablePrivacyMode}
                        label='Privacy Mode'
                        onChange={onTogglePrivacyMode}
                      />
                    }
                  />
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        shouldDismissPopover={false}
                        alignIndicator='right'
                        checked={enableDashboardCells}
                        label='Dashboard Cells'
                        onChange={onToggleDashboardCells}
                      />
                    }
                  />
                  <MenuItem2
                    shouldDismissPopover={false}
                    text={
                      <Switch
                        shouldDismissPopover={false}
                        alignIndicator='right'
                        checked={enableNotableNodesTab}
                        label='Notable Nodes'
                        onChange={onToggleNotableNodesTab}
                      />
                    }
                  />
                  <CurrencyMenuItem
                    selectedCurrency={selectedCurrency}
                    currencyRates={currencyRates}
                    onChange={onSelectCurrency}
                  />
                </Menu>
              }
              interactionKind='click'
              isOpen={isSettingMenuOpen}
              onInteraction={(state) => setSettingMenuOpen(state)}
              placement='bottom'
            >
              <Button large minimal intent='primary' icon={'cog'} />
            </Popover2>
          )}
        </LayoutContext.Consumer>
      </Navbar.Group>
    </Navbar>
  );
}
