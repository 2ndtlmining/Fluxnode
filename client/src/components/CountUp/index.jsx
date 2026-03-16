import React from 'react';
import './index.scss';
import { format_amount } from 'utils';

import CountUp from 'react-countup';

const FRACTION_DIGITS = 2;

function CountUpWrapper({ isDecimal, decimals, ...props }) {
  const { end, prefix = '', suffix = '' } = props;
  const decimalPlaces = decimals != null ? decimals : (isDecimal ? FRACTION_DIGITS : 0);
  return process.env.REACT_APP_ENABLE_NUMBER_SPINNING === 'true' ? (
    <CountUp {...props} decimals={decimalPlaces} />
  ) : (
    <span>
      {prefix}
      {format_amount(end, false, decimalPlaces)}
      {suffix}
    </span>
  );
}

export default CountUpWrapper;
