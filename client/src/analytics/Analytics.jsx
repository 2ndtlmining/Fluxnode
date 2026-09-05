import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import { NetworkTab } from 'analytics/NetworkTab';
import { DonorTab } from 'analytics/DonorTab';
import './Analytics.scss';

/*
 * Three tabs exist today (Apps, Network, Donor). Chain Activity lands in a
 * later session — add it as one more <Tab> entry here, not a restructure.
 * Gated by PremiumGate at the route level (Application.jsx), same as
 * /live — this component only renders once already unlocked.
 */
export default function Analytics() {
  return (
    <div className="analytics-page">
      <Helmet>
        <title>Analytics</title>
      </Helmet>

      <div className="analytics-page-header">
        <span className="analytics-page-title">Analytics</span>
        <span className="analytics-page-subtitle">
          Network-wide stats for FluxNode donors.
        </span>
      </div>

      <Tabs id="analytics-tabs" className="analytics-tabs" renderActiveTabPanelOnly>
        <Tab id="apps" title="Apps" panel={<AppsTab />} />
        <Tab id="network" title="Network" panel={<NetworkTab />} />
        <Tab id="donor" title="Donor" panel={<DonorTab />} />
      </Tabs>
    </div>
  );
}
