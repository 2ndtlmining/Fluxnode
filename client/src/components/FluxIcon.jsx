import React from 'react';

export function FluxIcon(props) {
  const { viewBox: p_viewBox, width: p_width, height: p_height, ...other } = props;

  const viewBox = p_viewBox;
  const width = p_width || 32;
  const height = p_height || 32;

  return (
    <svg {...other} xmlns='http://www.w3.org/2000/svg' width={width} height={height} viewBox={viewBox}>
      <g id='Layer_2' data-name='Layer 2'>
        <g id='Flux_white-blue' data-name='Flux white-blue'>
          <g id='Group_179' data-name='Group 179'>
            <path
              id='Path_73'
              data-name='Path 73'
              d='M17.29,24.27l-1.76,1-3.78-2.18,1.72-1,0,0,.07,0Z'
              style={{ fill: 'currentColor' }}
            />
            <path
              id='Path_74'
              data-name='Path 74'
              d='M24.05,10.53v2.05l-3.72-2.15-1-.58-1,.58-4.74,2.74-1,.58V15L10.74,13.9l-1-.58-1,.58L7,14.89V10.53l8.52-4.91Z'
              style={{ fill: 'currentColor' }}
            />
            <path
              id='Path_75'
              data-name='Path 75'
              d='M24.05,14.91v5.47l-4.73,2.73h0l-4.73-2.73V14.91l4.74-2.73Z'
              style={{ fill: 'currentColor' }}
            />
            <path
              id='Path_76'
              data-name='Path 76'
              d='M12.46,17.22v3.15L9.73,21.94,7,20.37V17.22l2.72-1.57Z'
              style={{ fill: 'currentColor' }}
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
