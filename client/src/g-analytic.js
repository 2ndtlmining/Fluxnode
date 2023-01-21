import { IS_DEV, IS_TEST_BUILD } from 'app-buildinfo';
import ReactGA from 'react-ga4';

ReactGA.initialize(process.env.REACT_APP_GOOGLE_ANALYTICS_ID, { testMode: IS_TEST_BUILD || IS_DEV });

export const setGAPageView = (path) => {
  ReactGA.send({ hitType: "pageview", page: path });
}

export const setGAEvent = event => {
  ReactGA.event(event);
}