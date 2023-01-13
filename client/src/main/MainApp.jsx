import React from 'react';
import './MainApp.scss';

import { Helmet } from 'react-helmet';

import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Col, Container, Row } from 'react-grid-system';

import { AppToaster } from 'main/AppToaster';
import { DashboardCells } from 'main/Header';
import { ParallelAssets } from 'main/ParallelAssets';
import { PayoutTimer } from 'main/PayoutTimer';
import { WalletNodes } from 'main/WalletNodes';

import {
  Button, FormGroup, Icon, InputGroup, Menu,
  MenuItem, mergeRefs, Spinner
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';

import {
  create_global_store, fetch_global_stats, isWalletDOSState, pa_summary_full, validateAddress, wallet_pas_summary
} from './apidata';

import { appStore, StoreKeys } from 'persistance/store';

import { LayoutContext } from 'contexts/LayoutContext';
import { blurAllInputs } from 'utils';

const WALLET_INPUT_ID = '_WALLET_INPUT_';
const SEARCH_HISTORY_BOX_CLASS = '_SEARCH_HISTORY_BOX_';

class MainApp extends React.Component {
  constructor(props) {
    super(props);
    window.MainApp = this;

    this.state = {
      activeAddress: null,
      searchHistory: [],
      showSearchHistory: false,
      selectedHistoryItemIndex: -1,

      isNodesLoading: false,

      gstore: create_global_store(),
      isWalletAvailable: false,
      isDOS: false,

      isPALoading: false,
      walletPASummary: pa_summary_full()
    };

    this.walletNodes = React.createRef();
    window.addressInputRef = this.addressInputRef = React.createRef();

    this._historyListRef = React.createRef();

    this._payoutTimerRef = React.createRef();
    this.payoutTimer = null;

    this.mounted = false;
    this.setSearch = null;

    const _this = this;
    document.onclick = function (event) {
      var el = event.target;
      if (!el.closest('.' + SEARCH_HISTORY_BOX_CLASS) && !el.closest('#' + WALLET_INPUT_ID)) {
        _this.changeSearchVisibility(false);
      }
    };
  }

  async componentDidMount() {
    if (this.mounted) return;
    this.mounted = true;

    window.historyListRef = this._historyListRef;
    window.payoutTimer = this.payoutTimer = this._payoutTimerRef.current;

    this.setSearch = this.props.router.search[1];

    const _this = this;
    let loadedHistory = [];
    try {
      loadedHistory = await appStore.getItem(StoreKeys.ADDR_SEARCH_HISTORY);
    } catch {}

    let searchHistory = this._createNewHistoryList(loadedHistory, null);
    appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, searchHistory);
    this.setState({ searchHistory }, () => this.hydrateApp());
  }

  _createNewHistoryList(oldValues, newTop) {
    if (!oldValues || oldValues.constructor !== Array) {
      if (!newTop) return [];
      else return [newTop];
    }

    let _historyClone = [];
    for (let i = 0; i < oldValues.length; i++) {
      let val = oldValues[i];
      if (val != newTop && _historyClone.indexOf(val) == -1)
        //
        _historyClone.push(val);
    }

    if (newTop) _historyClone.push(newTop);

    return _historyClone;
  }

  hydrateApp() {
    const { location } = this.props.router;
    let params = new URLSearchParams(location.search);

    const wallet = params.get('wallet');
    if (!!wallet && wallet != '') {
      const address = wallet.toString();
      this.onProcessAddress(address);
      this.addressInputRef.current.value = address;
    } else {
      fetch_global_stats(null).then((gstore) => {
        this.setState({ gstore });
      });
    }
  }

  async onProcessAddress(wAddress = null) {
    this.setState({
      isNodesLoading: true,
      isWalletAvailable: false,
      showSearchHistory: false,
      selectedHistoryItemIndex: -1
    });

    this.payoutTimer.pauseAndHide();

    const oldAddress = this.state.activeAddress;
    const walletView = this.walletNodes.current;

    let address;
    if (wAddress == null) {
      address = this.addressInputRef.current.value.trim();
    } else {
      // https://stackoverflow.com/a/31733628
      address = (' ' + wAddress).slice(1);
    }

    this.setState({ isNodesLoading: true });

    const valid = await validateAddress(address);
    if (!valid) {
      this.setState({ isNodesLoading: false });

      const isWalletAvailable = oldAddress != null;
      this.setState({ isWalletAvailable });

      if (isWalletAvailable) this.payoutTimer.resumeAndShow();

      AppToaster.show({
        intent: 'danger',
        icon: 'disable',
        message: (
          <>
            Invalid wallet address <strong>{address}</strong>
          </>
        )
      });
      return;
    }

    blurAllInputs();
    this.setSearch({ wallet: address }, { replace: false });

    {
      let newSearchHistory = this._createNewHistoryList(this.state.searchHistory, address);
      this.setState({ searchHistory: newSearchHistory });
      await appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, newSearchHistory);
    }

    let isDOS = await isWalletDOSState(address);
    this.setState({ isDOS });

    const gstore = await fetch_global_stats(address);
    this.setState({
      isWalletAvailable: true,

      isNodesLoading: false,
      isPALoading: true, // Now start to fetch PA's (below)

      gstore,
      activeAddress: address
    });

    walletView.processAddress(address, gstore, (highestRankedNode) => {
      this.payoutTimer.receiveNode(highestRankedNode);
    });

    const summary = await wallet_pas_summary(address);
    this.setState({ isPALoading: false, walletPASummary: summary });
  }

  handleButtonClick = () => this.onProcessAddress();

  handleAddrKeyPress = (e) => {
    if (e.key == 'Enter') {
      if (this.state.showSearchHistory && this.state.selectedHistoryItemIndex > -1) {
        const addr = this.state.searchHistory[this.state.selectedHistoryItemIndex];
        this.addressInputRef.current.value = addr;
        this.onProcessAddress(addr);
      } else {
        this.onProcessAddress();
      }
    }
  };

  onRefreshRequest = () => {
    this.onProcessAddress(this.state.activeAddress);
  };

  DOS_WARNING = (
    <div className='fs-6 pt-1 center-text-flow'>
      <Icon icon='warning-sign' className='me-2' intent='warning' size={17} />
      This wallet is currently in&nbsp;<strong>DOS state</strong>
    </div>
  );

  renderActiveAddressView() {
    return (
      <div className='d-flex justify-content-between adp-bg-normal addrview'>
        <span>Current Wallet Address</span>
        <a href={'https://explorer.runonflux.io/address/' + this.state.activeAddress}>{this.state.activeAddress}</a>
      </div>
    );
  }

  changeSearchVisibility(visible) {
    if (this.state.showSearchHistory == visible) return;
    this.setState({ showSearchHistory: visible, selectedHistoryItemIndex: -1 });
  }

  _selectAddr = (addr) => {
    this.addressInputRef.current.value = addr;
    this.setState({ showSearchHistory: false });
  };

  _renderSearchHistory() {
    let _this = this;

    let items = this.state.searchHistory;
    const itemRenders = [];

    for (let i = items.length - 1; i >= 0; i--) {
      let selected = i == this.state.selectedHistoryItemIndex;
      const addr = items[i];
      itemRenders.push(
        <MenuItem
          key={i}
          text={addr}
          shouldDismissPopover={false}
          tagName='span'
          multiline
          selected={selected}
          onClick={(e) => {
            e.preventDefault();
            _this._selectAddr(addr);
          }}
          intent={selected ? 'primary' : 'none'}
        />
      );
    }

    return (
      <Menu id='history-add-list' ulRef={this._historyListRef} className='adp-bg-normal py-1'>
        {itemRenders}
      </Menu>
    );
  }

  detectHistoryGestures = (event) => {
    if (event.key == 'Escape') {
      this.changeSearchVisibility(false);
      return;
    }

    const itemCount = this.state.searchHistory.length;
    let _idx = this.state.selectedHistoryItemIndex;

    let selectedIndex = Math.max(-1, isNaN(_idx) ? -1 : _idx);

    let _this = this;
    const moveToIndex = (index) => {
      this.setState({ selectedHistoryItemIndex: index });
      let listNode = _this._historyListRef.current;
      if (!listNode) return;

      let childNode = listNode.children.item(index);
      if (childNode)
        childNode.scrollIntoView({
          block: 'nearest'
        });
    };

    if (event.key === 'ArrowDown') {
      moveToIndex((itemCount + Math.max(selectedIndex, 0) - 1) % itemCount);
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      moveToIndex((itemCount + selectedIndex + 1) % itemCount);
      event.preventDefault();
    }
  };

  renderAddressInput() {
    let dos = this.state.isWalletAvailable && this.state.isDOS;
    let intent = dos ? 'warning' : 'none';

    let openHistoryBox = this.state.showSearchHistory && this.state.searchHistory.length > 0;

    return (
      <div className={'bp4-form-group ' + `bp4-intent-${intent}`}>
        <label className='bp4-label'>Wallet Address</label>
        <div className='bp4-form-content'>
          <Popover2
            {...this.HISTORY_BOX_POPOVER_OPTIONS}
            //
            isOpen={openHistoryBox}
            //
            placement='bottom'
            //
            content={this._renderSearchHistory()}
            popoverClassName='_SEARCH_HISTORY_BOX_'
            //
            renderTarget={({ isOpen, ref, ...targetProps }) => (
              <InputGroup
                {...targetProps}
                onKeyDown={this.detectHistoryGestures}
                fill
                intent={intent}
                leftIcon='antenna'
                placeholder='Enter Wallet Address'
                id={WALLET_INPUT_ID}
                value={this.state.inputAddress}
                onChange={this.handleAddrChange}
                onKeyPress={this.handleAddrKeyPress}
                inputRef={mergeRefs(ref, this.addressInputRef)}
                onFocus={this.changeSearchVisibility.bind(this, true)}
              />
            )}
          />
          {dos && <div className='bp4-form-helper-text'>{this.DOS_WARNING}</div>}
        </div>
      </div>
    );
  }

  HISTORY_BOX_POPOVER_OPTIONS = {
    hasBackdrop: false,
    usePortal: true,

    enforceFocus: false,
    autoFocus: false,
    minimal: true,
    shouldReturnFocusOnClose: false,
    matchTargetWidth: true,
    transitionDuration: 50,
    hoverOpenDelay: 0,
    hoverCloseDelay: 0
  };

  render() {
    return (
      <>
        <Helmet>
          <title>Wallet</title>
        </Helmet>

        <DashboardCells gstore={this.state.gstore} />
        {this.state.isWalletAvailable && this.renderActiveAddressView()}

        <Container fluid style={{ margin: '20px 20px' }}>
          <Row>
            <Col style={{ paddingBottom: '10px' }} md={12}>
              <PayoutTimer ref={this._payoutTimerRef} />
            </Col>
            <Col style={{ paddingBottom: '10px' }} md={9}>
              {this.renderAddressInput()}
            </Col>
            <Col md={3}>
              <FormGroup label='&nbsp;'>
                <Button
                  fill
                  onClick={this.handleButtonClick}
                  text='Search Wallet'
                  intent='primary'
                  icon='array-string'
                />
              </FormGroup>
            </Col>
          </Row>
        </Container>

        <WalletNodes
          ref={this.walletNodes}
          parentLoading={this.state.isNodesLoading}
          onRefreshRequest={this.onRefreshRequest}
          activeAddress={this.state.activeAddress}
          initGStore={this.state.gstore}
        />
        <LayoutContext.Consumer>
          {({ enableParallelAssetsTab }) =>
            enableParallelAssetsTab && this.state.isWalletAvailable ? (
              <div className='pa-area border-top adp-border-color'>
                <h1 className='fs-3 text-center text-success p-3 border-bottom adp-border-color center-text-flow-mid pa-heading'>
                  <Icon icon='comparison' size={30} className='me-3' />
                  Parallel Assets
                </h1>
                <br />
                {this.state.isPALoading ? (
                  <Spinner intent='primary' size={150} />
                ) : (
                  <ParallelAssets summary={this.state.walletPASummary} />
                )}
              </div>
            ) : (
              <div style={{ paddingBottom: '100px' }}>&nbsp;</div>
            )
          }
        </LayoutContext.Consumer>
      </>
    );
  }
}

function withRouter(Component) {
  return (props) => {
    let location = useLocation();
    let navigate = useNavigate();
    let params = useParams();
    let search = useSearchParams();
    return <Component {...props} router={{ location, navigate, params, search }} />;
  };
}

export default withRouter(MainApp);
