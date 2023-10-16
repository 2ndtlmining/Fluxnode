import React from 'react';
import './index.scss';
import { IconContext } from 'react-icons';
import { format_amount } from 'utils';
import { FaExchangeAlt } from 'react-icons/fa';
import CountUp from 'components/CountUp';

export function InfoCell({
  name,
  value,
  icon,
  iconColor,
  iconColorAlt,
  small,
  large,
  className,
  elementRef,
  iconWrapClassName,
  isPrivacy,
  prefix = '',
  suffix = '',
  toggleBtn,
  children,
  ...otherProps
}) {
  const style = {};
  if (iconColorAlt) style.backgroundColor = iconColorAlt;
  if (iconColor) style.color = iconColor;

  const styleProps = { style };
  
  const isDecimal = !Number.isInteger(value);

  const countupValue = (<CountUp end={value} separator=',' duration={2} isDecimal prefix={prefix} suffix={suffix} />);

  return (
    <div {...otherProps} className={'information-cell-layout' + (!!className ? ' ' + className : '')} ref={elementRef}>
      <div className='icl-icon'>
        {icon && <div className={'icl-i-wrap' + (!!iconWrapClassName ? ' ' + iconWrapClassName : '')} {...styleProps}>
          <IconContext.Provider value={{ size: '28px', color: iconColor }}>{icon}</IconContext.Provider>
        </div>}
      </div>

      <div className='icl-content'>
        <p className={'icl-c-val' + (small ? ' icl-val-small' : large ? ' icl-val-large' : '')}>
          {!isPrivacy ? countupValue : `${format_amount(value, isPrivacy)}${suffix}`}
        </p>
        <p className='icl-c-name'>{name}</p>
      </div>
      {toggleBtn && <button className='icl-toggle-btn' onClick={toggleBtn}><FaExchangeAlt /></button>}
    </div>
  );
}
