import React from 'react';
import './index.scss';
import { IconContext } from 'react-icons';

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
  ...otherProps
}) {
  const style = {};
  if (iconColorAlt) style.backgroundColor = iconColorAlt;
  if (iconColor) style.color = iconColor;

  const styleProps = { style };

  return (
    <div {...otherProps} className={'information-cell-layout' + (!!className ? ' ' + className : '')} ref={elementRef}>
      <div className='icl-icon'>
        <div className={'icl-i-wrap' + (!!iconWrapClassName ? ' ' + iconWrapClassName : '')} {...styleProps}>
          <IconContext.Provider value={{ size: '28px', color: iconColor }}>{icon}</IconContext.Provider>
        </div>
      </div>

      <div className='icl-content'>
        <p className={'icl-c-val' + (small ? ' icl-val-small' : large ? ' icl-val-large' : '')}>{value}</p>
        <p className='icl-c-name'>{name}</p>
      </div>
    </div>
  );
}
