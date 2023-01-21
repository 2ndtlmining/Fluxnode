import React from 'react';

import './Projection.scss';

import { Icon, ButtonGroup, Button, Spinner } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';

import { wallet_health_full } from 'main/apidata';
import { FluxIcon } from 'components/FluxIcon.jsx';

import { FiZap, FiCpu, FiPackage } from 'react-icons/fi';

import { IconContext } from 'react-icons';
import CountUp from 'react-countup';

const RenderedFluxIcon = (
  <FluxIcon width={21} height={21} viewBox='5 5 21.71 21.71' style={{ margin: '0 4px 0 6px' }} />
);
const RenderedUSDIcon = <Icon icon='dollar' size={21} style={{ margin: '0 2px 0 6px' }} />;

export class Projection extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      toggleTime: 'month',
      toggleCurrency: 'usd'
    };
  }

  viewToggleStatusTime() {
    return this.state.toggleTime == 'month' ? 'Monthly' : 'Daily';
  }

  viewToggleStatusCurrency() {
    return this.state.toggleCurrency == 'usd' ? 'USD' : 'Flux';
  }

  onToggleChangeTime = () => {
    this.setState({ toggleTime: this.state.toggleTime == 'day' ? 'month' : 'day' });
  };

  onToggleChangeCurrency = () => {
    this.setState({ toggleCurrency: this.state.toggleCurrency == 'flux' ? 'usd' : 'flux' });
  };

  projectionValue(nodeHealthObj) {
    const { toggleTime: time, toggleCurrency: currency } = this.state;

    let value = 0;

    if (time == 'day' && currency == 'flux') value = nodeHealthObj.projection_daily.flux;
    else if (time == 'day' && currency == 'usd') value = nodeHealthObj.projection_daily.usd;
    else if (time == 'month' && currency == 'flux') value = nodeHealthObj.projection_montly.flux;
    else if (time == 'month' && currency == 'usd') value = nodeHealthObj.projection_montly.usd;

    // return value.toFixed(4);
    return value;
  }

  renderHeader() {
    return (
      <div className='d-flex justify-content-between align-items-start'>
        <Tooltip2
          intent='danger'
          placement='top-end'
          usePortal={true}
          transitionDuration={100}
          hoverOpenDelay={60}
          content={'Estimates includes Flux and currently released parallel assets'}
        >
          <h2 className='earn-title center-text-flow'>
            <Icon icon='git-push' size={25} className='margin-r-m' />
            <span>Estimated Earnings</span>
          </h2>
        </Tooltip2>

        <ButtonGroup minimal>
          <Button
            alignText='right'
            intent='primary'
            className='proj-view-toggle'
            rightIcon='exchange'
            onClick={this.onToggleChangeTime}
          >
            {this.viewToggleStatusTime()}
          </Button>

          <Button
            alignText='right'
            intent='danger'
            className='proj-view-toggle'
            rightIcon='exchange'
            onClick={this.onToggleChangeCurrency}
          >
            {this.viewToggleStatusCurrency()}
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  getCurrencyIcon() {
    return this.state.toggleCurrency == 'usd' ? RenderedUSDIcon : RenderedFluxIcon;
  }

  formatEarningValue(value) {
    return <CountUp duration={5} end={value} separator=',' decimals={4} />;
  }

  formatTotalNodes(value) {
    return <CountUp duration={5} end={value} separator=',' />;
  }

  renderBody() {
    let earningCumulus = this.projectionValue(this.props.health.cumulus);
    let earningNimbus = this.projectionValue(this.props.health.nimbus);
    let earningStratus = this.projectionValue(this.props.health.stratus);

    let earningTotal = earningCumulus + earningNimbus + earningStratus;

    return (
      <IconContext.Provider value={{ size: '19px', color: 'currentColor' }}>
        <div className='proj-body'>
          <div className='tier-proj'>
            <div className='tp-icon'>
              <div className='tp-i-wrap dash-cell__nodes-cumulus'>
                <FiZap />
              </div>
            </div>
            <span className='tp-name adp-text-normal'>Cumulus</span>
            <div className='flex-fill align-self-stretch d-flex flex-column justify-content-center align-items-end'>
              <div className='center-text-flow'>
                <span className='tp-value adp-text-normal'>{this.formatEarningValue(earningCumulus)}</span>
                <span className='adp-text-muted currency-name'>{this.viewToggleStatusCurrency()}</span>
              </div>
              <span className='mt-1 adp-text-muted'>
                Node Count: <span className='fw-bold fs-6'>{this.props.health.cumulus.node_count}</span>
              </span>
            </div>
          </div>

          <div className='tier-proj'>
            <div className='tp-icon'>
              <div className='tp-i-wrap dash-cell__nodes-nimbus'>
                <FiCpu />
              </div>
            </div>
            <span className='tp-name adp-text-normal'>Nimbus</span>
            <div className='flex-fill align-self-stretch d-flex flex-column justify-content-center align-items-end'>
              <div className='center-text-flow'>
                <span className='tp-value adp-text-normal'>{this.formatEarningValue(earningNimbus)}</span>
                <span className='adp-text-muted currency-name'>{this.viewToggleStatusCurrency()}</span>
              </div>
              <span className='mt-1 adp-text-muted'>
                Node Count: <span className='fw-bold fs-6'>{this.props.health.nimbus.node_count}</span>
              </span>
            </div>
          </div>

          <div className='tier-proj'>
            <div className='tp-icon'>
              <div className='tp-i-wrap dash-cell__nodes-stratus'>
                <FiPackage />
              </div>
            </div>
            <span className='tp-name adp-text-normal'>Stratus</span>
            <div className='flex-fill align-self-stretch d-flex flex-column justify-content-center align-items-end'>
              <div className='center-text-flow'>
                <span className='tp-value adp-text-normal'>{this.formatEarningValue(earningStratus)}</span>
                <span className='adp-text-muted currency-name'>{this.viewToggleStatusCurrency()}</span>
              </div>
              <span className='mt-1 adp-text-muted'>
                Node Count: <span className='fw-bold fs-6'>{this.props.health.stratus.node_count}</span>
              </span>
            </div>
          </div>

          <div className='tier-proj pt-3 border-bottom-0'>
            <span className='tp-name adp-text-normal'>Total Earnings</span>
            <div className='flex-fill align-self-stretch d-flex flex-column justify-content-center align-items-end'>
              <div className='center-text-flow'>
                <span className='tp-value adp-text-normal'>{this.formatEarningValue(earningTotal)}</span>
                <span className='adp-text-muted center-text-flow'>
                  {this.getCurrencyIcon()}
                  {this.viewToggleStatusCurrency()}
                </span>
              </div>
            </div>
          </div>

          <div className='tier-proj pt-3'>
            <span className='tp-name adp-text-normal'>Total Nodes</span>
            <div className='flex-fill align-self-stretch d-flex flex-column justify-content-center align-items-end'>
              <span className='tp-value adp-text-normal'>{this.formatTotalNodes(this.props.health.total_nodes)}</span>
            </div>
          </div>
        </div>
      </IconContext.Provider>
    );
  }

  render() {
    let content;

    if (this.props.loading) {
      content = (
        <div className='w-100 h-100 center-everything'>
          <Spinner intent='danger' size={150} />
        </div>
      );
    } else {
      content = (
        <>
          {this.renderHeader()}
          {this.renderBody()}
        </>
      );
    }

    return <div className='proj-card adp-border rounded-3 adp-bg-normal shadow-lg'>{content}</div>;
  }
}
