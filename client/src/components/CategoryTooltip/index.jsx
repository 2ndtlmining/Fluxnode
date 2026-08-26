import React from 'react';
import './index.scss';

import { CATEGORY_TOOLTIPS } from 'content/appCategoryMeta';
import { shortImageName } from 'utils';

/*
 * Category tooltip: the static description, plus the three biggest apps in that
 * category with their container counts.
 *
 * The bar chart alone implies a dozen comparably-composed ecosystems. In
 * practice several categories are one app wearing a category's clothes —
 * Computing is 99% Folding@Home, Monitoring is 94% Globalping — and that only
 * becomes visible when you name the members.
 *
 * `breakdown` comes from gstore.runningCategoryTop and may be absent: the Apps
 * tab renders per-wallet data, and the spec panels render per-app rows, where
 * network-wide totals would be misleading. Those pass nothing and get the
 * description alone.
 */
export function CategoryTooltip({ category, breakdown }) {
  const description = CATEGORY_TOOLTIPS[category] || category;
  const top = breakdown?.top || [];

  return (
    <div className="cat-tooltip">
      <div className="cat-tooltip__desc">{description}</div>

      {top.length > 0 && (
        <ul className="cat-tooltip__list">
          {top.map(({ image, count }) => (
            <li key={image} className="cat-tooltip__row">
              <span className="cat-tooltip__name">{shortImageName(image)}</span>
              <span className="cat-tooltip__count">{count.toLocaleString()}</span>
            </li>
          ))}

          {breakdown.otherCount > 0 && (
            <li className="cat-tooltip__row cat-tooltip__row--rest">
              <span className="cat-tooltip__name">
                +{breakdown.otherCount} other{breakdown.otherCount === 1 ? '' : 's'}
              </span>
              <span className="cat-tooltip__count">{breakdown.otherTotal.toLocaleString()}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
