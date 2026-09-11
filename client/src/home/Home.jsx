import React from 'react';
import './Home.scss';

import { Helmet } from 'react-helmet';

import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { Col, Container, Row } from 'react-grid-system';

import { AppToaster } from 'components/AppToaster';
import { HomeOverview } from 'home/HomeOverview';
import { DonorBadge } from 'donor/DonorBadge';
import { WalletDonationChip } from 'donor/WalletDonationChip';
import { runDonorAutoDetect } from 'donor/runDonorAutoDetect';
import { CHECK_STATUS } from 'donor/donorWalletCheck';
import {
  createNewHistoryList,
  displayedAddress,
  initialPrivacyState,
  privacyStatePatch,
  processedAddressPatch,
  resolveHydrationTarget
} from 'wallet/addressInput';

import { Button, Icon, InputGroup, Menu, MenuItem, mergeRefs, Switch } from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
//DO NOT REMOVE: package for store subscriber

import { Observable }  from 'rxjs';

import {
  create_global_store,
  fetch_global_stats,
  fetch_country_node_counts,
  isWalletDOSState,
  pa_summary_full,
  validateAddress,
  wallet_pas_summary,
  fetch_wallet_donation_summary,
  fetch_donation_totals,
  fetch_total_network_utils,
  fetch_gpu_prices
} from 'apidata';

import { appStore, StoreKeys } from 'persistance/store';

import { LayoutContext } from 'contexts/LayoutContext';
import { blurAllInputs } from 'utils';


const WALLET_INPUT_ID = '_WALLET_INPUT_';
const SEARCH_HISTORY_BOX_CLASS = '_SEARCH_HISTORY_BOX_';

class Home extends React.Component {
  static contextType = LayoutContext;

  constructor(props) {
    super(props);
    window.HomeApp = this;

    this.state = {
      addressInput: '',
      activeAddress: null,
      searchHistory: [],
      showSearchHistory: false,
      selectedHistoryItemIndex: -1,

      isNodesLoading: false,

      gstore: create_global_store(),
      isWalletAvailable: false,
      isDOS: false,

      isPALoading: false,
      walletPASummary: pa_summary_full(),
      privacyMode: false,
      isZelId: false,

      totalDonations: 0,
      donationsChecked: false,
      donationsCheckFailed: false,

      countryCounts: [],
      donations: null,
      donationsSettled: false,
      donationsFailed: false,
      countryCountsSettled: false,
      countryCountsFailed: false,
      gpuPrices: null
    };

    this._refreshInterval = null;
    this._autoRefreshActive = false;
    
    this.walletNodes = React.createRef();
    window.addressInputRef = this.addressInputRef = React.createRef();
    

    this._historyListRef = React.createRef();

    this._payoutTimerRef = React.createRef();
    this.payoutTimer = null;

    this._bestUptimeRef = React.createRef();
    this.bestUptime = null;

    this._mostHostedRef = React.createRef();
    this.mostHosted = null;

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
    window.bestUptime = this.bestUptime = this._bestUptimeRef.current;
    window.mostHosted = this.mostHosted = this._mostHostedRef.current;

    this.setSearch = this.props.router.search[1];

    const _this = this;
    let loadedHistory = [];
    try {
      loadedHistory = await appStore.getItem(StoreKeys.ADDR_SEARCH_HISTORY);
      // #251: a bare setState here set the flag but left inputAddress
      // unmasked, and privacyStatePatch's transition check then bailed out,
      // so a page loaded with privacy ALREADY on showed the address in full.
      const storedPrivacy = await appStore.getItem(StoreKeys.PRIVACY_MODE);
      this.setState((prev) => initialPrivacyState(storedPrivacy, prev.activeAddress));
    } catch {}

    let searchHistory = this._createNewHistoryList(loadedHistory, null);
    appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, searchHistory);
    this.setState({ searchHistory }, () => this.hydrateApp());

    const hideSensitiveData = (isPrivateModeEnabled) => {
      const { activeAddress } = this.state;
      if (!activeAddress) {
        this.setState({ privacyMode: isPrivateModeEnabled });
        return;
      }
      /*
       * The <InputGroup> is controlled by state.inputAddress, so the mask has
       * to go through setState. Writing addressInputRef.current.value -- what
       * this did before -- is undone by the very next render, which is why
       * privacy mode never actually masked the field.
       */
      const shown = displayedAddress(isPrivateModeEnabled, activeAddress);
      this.setState({ privacyMode: isPrivateModeEnabled, inputAddress: shown });
      this.setSearch({ wallet: shown }, { replace: false });
    };

    await appStore.ready(function () {
      appStore.newObservable.factory = function (subscribeFn) {
        return new Observable(subscribeFn);
      };

      var methodCallObservable = appStore.newObservable({
        key: StoreKeys.PRIVACY_MODE,
        changeDetection: false
      });

      _this.methodCallSubscription = methodCallObservable.subscribe({
        next: function (args) {
          hideSensitiveData(args.newValue);
        }
      });
    });

    this._setDefaultAddress(this.props.defaultAddress);
    if (this.context.autoRefresh) this._startAutoRefresh();
  }

  /*
   * Keep the address field in step with the privacy toggle (issue #166).
   *
   * This is the only thing that masks the field: the <InputGroup> is
   * controlled by state.inputAddress, so writing addressInputRef.current.value
   * is reverted by the next render. The URL is masked separately, by
   * LayoutContext's own effect. privacyStatePatch returns null when nothing
   * changed, which React treats as a bail-out, so this is safe to call on
   * every update.
   */
  _syncPrivacyMode() {
    this.setState((prev) => privacyStatePatch(this.context.enablePrivacyMode, prev));
  }

  componentDidUpdate() {
    this._syncPrivacyMode();

    const shouldRefresh = this.context.autoRefresh;
    if (shouldRefresh && !this._autoRefreshActive) {
      this._startAutoRefresh();
    } else if (!shouldRefresh && this._autoRefreshActive) {
      this._stopAutoRefresh();
    }
  }

  componentWillUnmount() {
    this._stopAutoRefresh();
    if (this.methodCallSubscription) this.methodCallSubscription.unsubscribe();
  }

  _startAutoRefresh() {
    this._stopAutoRefresh();
    this._autoRefreshActive = true;
    this._refreshInterval = setInterval(() => {
      if (this.state.activeAddress) this.onRefreshRequest();
    }, 5 * 60 * 1000);
  }

  _stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
    this._autoRefreshActive = false;
  }

  _setDefaultAddress(defaultAddress) {
    if (defaultAddress) {
      this.onProcessAddress(defaultAddress);
      this.setState({ inputAddress: defaultAddress });
    }
  }

  _createNewHistoryList(oldValues, newTop) {
    return createNewHistoryList(oldValues, newTop);
  }

  /*
   * NODE DISTRIBUTION and the Flux Edge GPU / FluxAI rows describe the whole
   * network, not the wallet being viewed, so they load on EVERY mount (#250).
   *
   * They previously sat inside hydrateApp's no-wallet branch, so arriving with
   * a ?wallet= link -- or as an unlocked donor, after #230 added that branch --
   * left NODE DISTRIBUTION spinning forever and silently dropped two rows from
   * the FLUX NETWORK panel. Neither has anything to do with the wallet.
   *
   * `countryCountsSettled` is what lets the panel tell "still loading" from
   * "tried and failed"; the old `.catch(() => {})` made those identical.
   */
  _loadNetworkWideData() {
    fetch_country_node_counts()
      .then((counts) =>
        this.setState({ countryCounts: counts, countryCountsSettled: true, countryCountsFailed: false })
      )
      .catch(() => this.setState({ countryCountsSettled: true, countryCountsFailed: true }));

    fetch_gpu_prices()
      .then((data) => this.setState({ gpuPrices: data }))
      .catch(() => {});

    // #258: community donation totals. Network-wide, so it belongs here with
    // the other panels that describe the network rather than the wallet.
    fetch_donation_totals()
      .then(({ ok, totals }) =>
        this.setState({ donations: totals, donationsSettled: true, donationsFailed: !ok })
      )
      .catch(() => this.setState({ donationsSettled: true, donationsFailed: true }));
  }

  hydrateApp() {
    const { location } = this.props.router;
    const params = new URLSearchParams(location.search);

    this._loadNetworkWideData();

    /*
     * resolveHydrationTarget owns the "which wallet, if any" decision (#249).
     * It used to be inlined here and in MainApp.jsx, with the same two bugs in
     * both copies -- see wallet/addressInput.js for what they were.
     */
    const { address, inputAddress } = resolveHydrationTarget({
      urlWallet: params.get('wallet'),
      donorWallet: this.props.donorWallet,
      privacyMode: this.state.privacyMode,
      activeAddress: this.state.activeAddress,
      searchHistory: this.state.searchHistory
    });

    if (address) {
      this.onProcessAddress(address);
      // The field shows the MASKED form when privacy is on; onProcessAddress
      // still gets the real address to look up (#251).
      if (this.addressInputRef.current) this.addressInputRef.current.value = inputAddress;
      // The input is controlled: without this it renders blank despite the
      // ref write above.
      this.setState({ inputAddress });
      return;
    }

    fetch_global_stats(null)
      .then((gstore) => {
        this.setState({ gstore });
        return fetch_total_network_utils(gstore);
      })
      .then((gstore) => {
        this.setState({ gstore });
        this.context.setLastUpdated(new Date());
        this.context.setArcaneHumanVersion(gstore.arcane_os?.humanVersion ?? null);
      });
  }

  async onProcessAddress(wAddress = null) {
    this.setState({
      isNodesLoading: true,
      isWalletAvailable: false,
      showSearchHistory: false,
      selectedHistoryItemIndex: -1
    });

    if (this.payoutTimer) this.payoutTimer.pauseAndHide();
    if (this.bestUptime) this.bestUptime.loading();
    if (this.mostHosted) this.mostHosted.loading();

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

      if (isWalletAvailable && this.payoutTimer) {
        this.payoutTimer.resumeAndShow();
      }

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

    // Fire-and-forget donor auto-detection — doesn't block or affect
    // anything else in this method. Silent unless the wallet qualifies,
    // in which case a toast confirms it (see below).
    runDonorAutoDetect(address, { setDonorWallet: this.props.setDonorWallet }).then(({ status }) => {
      if (status === CHECK_STATUS.SUCCESS) {
        AppToaster.show({
          intent: 'success',
          icon: 'tick-circle',
          message: 'Your wallet qualifies — premium features unlocked!',
        });
      }
    }).catch(() => {});

    {
      let newSearchHistory = this._createNewHistoryList(this.state.searchHistory, address);
      this.setState({ searchHistory: newSearchHistory });
      await appStore.setItem(StoreKeys.ADDR_SEARCH_HISTORY, newSearchHistory);
    }

    let isDOS = await isWalletDOSState(address);
    this.setState({ isDOS });

    const gstore = await fetch_global_stats(address);

    // #258: the chip has to tell "never donated" from "could not check",
    // which fetch_total_donations cannot express -- it resolves 0 for both.
    fetch_wallet_donation_summary(address).then(({ ok, donationCount }) => {
      this.setState({
        totalDonations: donationCount,
        donationsChecked: true,
        donationsCheckFailed: !ok
      });
    });

    fetch_total_network_utils(gstore).then((store) => {
      this.setState({ gstore: store });
    });

    this.setState({
      isWalletAvailable: true,

      isNodesLoading: false,
      isPALoading: true, // Now start to fetch PA's (below)

      gstore,
      ...processedAddressPatch(this.state.privacyMode, address)
    });

    // walletView is a ref that has never actually been attached to a
    // rendered <WalletNodes> on this page (this.walletNodes' ref is
    // created in the constructor but no JSX anywhere sets ref={this.walletNodes}
    // — confirmed by searching this file and home/HomeOverview for a
    // <WalletNodes> tag; there isn't one). Before this fix, calling
    // .processAddress on that always-null ref threw synchronously,
    // silently killing everything below in this async method —
    // wallet_pas_summary, isPALoading clearing, setLastUpdated,
    // setArcaneHumanVersion never ran. Guarding it restores those without
    // attempting to also revive the notable-nodes feature itself (payout
    // timer / best uptime / most hosted), which needs a real render of
    // WalletNodes to compute — out of scope here, filed separately.
    if (walletView) {
      walletView.processAddress(address, gstore, ({ highestRankedNode, bestUptimeNode, mostHostedNode }) => {
        highestRankedNode && this.payoutTimer && this.payoutTimer.receiveNode(highestRankedNode);
        bestUptimeNode && this.bestUptime && this.bestUptime.receiveNode(bestUptimeNode);
        mostHostedNode && this.mostHosted && this.mostHosted.receiveNode(mostHostedNode);
      });
    }

    const summary = await wallet_pas_summary(address);
    this.setState({ isPALoading: false, walletPASummary: summary });
    this.context.setLastUpdated(new Date());
    this.context.setArcaneHumanVersion(this.state.gstore?.arcane_os?.humanVersion ?? null);
  }

  handleAddrChange = (e) => {
    this.setState({inputAddress: e.target.value})
  }

  

  handleButtonClick = () => {
    this.props.router.navigate(`/nodes?wallet=${this.addressInputRef.current.value}`);
  };


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

  handleZelIdSwitch = () => {
    this.setState((prevState) => ({ isZelId: !prevState.isZelId }));
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
        <div className='d-flex gap-2'>
          <span>Current Wallet Address</span>
          <DonorBadge />
          {/*
            #258: replaces a second gold medal that sat here showing a raw
            donation count. Two identical medals meaning different things
            (premium unlocked vs. this wallet has donated) was confusing, and
            a wallet that had never donated got nothing at all -- which is the
            state most visitors are in.
          */}
          <WalletDonationChip
            address={this.state.activeAddress}
            donationCount={this.state.totalDonations}
            settled={this.state.donationsChecked}
            failed={this.state.donationsCheckFailed}
            donationAddress={window.gContent?.ADDRESS_FLUX}
          />
        </div>

        <a href={'https://explorer.runonflux.io/address/' + this.state.activeAddress}>
          {displayedAddress(this.state.privacyMode, this.state.activeAddress)}
        </a>
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
        <div className='bp4-form-content mt-4'>
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
              <div className='form-group d-flex'>
                <InputGroup
                  {...targetProps}
                  onKeyDown={this.detectHistoryGestures}
                  fill
                  intent={intent}
                  placeholder={!this.state.isZelId ? 'Enter Wallet Address' : 'Enter Zel ID'}
                  id={WALLET_INPUT_ID}
                  value={this.state.inputAddress}
                  onChange={this.handleAddrChange}
                  onKeyUp={this.handleAddrKeyPress}
                  inputRef={mergeRefs(ref, this.addressInputRef)}
                  onFocus={this.changeSearchVisibility.bind(this, true)}
                />
                <Button onClick={this.handleButtonClick} intent='success' icon='search' />
              </div>
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
      <LayoutContext.Consumer>
        {({ enableParallelAssetsTab, enableDashboardCells, normalFontSize, enableNotableNodesTab }) => {
          const suffixClassName = normalFontSize ? '' : '-small';
          // {console.log(enablePrivacyMode)}
          return (
            <>
              <Helmet>
                <title>Home</title>
              </Helmet>
              <Container fluid style={{ margin: '20px 20px' }}>
                <Row justify='center'>
                  <Col style={{ paddingBottom: '10px' }} md={9}>
                    {this.renderAddressInput()}
                    {process.env.REACT_APP_SEARCH_BY_ZELID === 'true' && (
                      <div className='d-flex align-items-center justify-content-center'>
                        <h6>Search by: </h6>
                        <Switch
                          checked={this.state.isZelId}
                          label='Zel ID'
                          onChange={this.handleZelIdSwitch}
                          className='zel-id-switch mb-0 ms-3'
                        />
                      </div>
                    )}
                  </Col>
                </Row>
              </Container>

              <HomeOverview
                gstore={this.state.gstore}
                countryCounts={this.state.countryCounts}
                countryCountsSettled={this.state.countryCountsSettled}
                countryCountsFailed={this.state.countryCountsFailed}
                gpuPrices={this.state.gpuPrices}
                donations={this.state.donations}
                donationsSettled={this.state.donationsSettled}
                donationsFailed={this.state.donationsFailed}
              />
            </>
          );
        }}
      </LayoutContext.Consumer>
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



export default withRouter(Home);
