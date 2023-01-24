import React from 'react';
import './index.scss';
import { format_amount } from 'utils';

import CountUp from 'react-countup';

const FRACTION_DIGITS = 2;

function CountUpWrapper({ isDecimal, ...props }) {
  const { end, prefix } = props;
  return process.env.REACT_APP_ENABLE_NUMBER_SPINNING === 'true' ? (
    <CountUp {...props} decimals={isDecimal ? FRACTION_DIGITS : 0} />
  ) : (
    <span>
      {prefix}
      {format_amount(end)}
    </span>
  );
}

export default CountUpWrapper;
