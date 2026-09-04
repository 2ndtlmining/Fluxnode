import { Tabs, Tab } from '@blueprintjs/core';
import { Helmet } from 'react-helmet';
import { AppsTab } from 'analytics/AppsTab';
import './Analytics.scss';

/*
 * One tab exists today (Apps). Network/Donor/Chain Activity tabs land in
 * later sessions — add each as one more <Tab> entry here, not a
 * restructure. Gated by PremiumGate at the route level (Application.jsx),
 * same as /live — this component only renders once already unlocked.
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
      </Tabs>
    </div>
  );
}
