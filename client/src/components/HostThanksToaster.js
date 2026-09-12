import { Toaster, Position } from '@blueprintjs/core';

/*
 * A separate toaster from AppToaster (issue #245).
 *
 * AppToaster is bottom-left and carries the Demo-mode notice; this message is
 * meant to arrive from the top, and repositioning the shared one would move
 * that notice too.
 *
 * maxToasts: 1 because there is only ever one thing this says, and stacking
 * would be a bug rather than a feature.
 */
export const HostThanksToaster = Toaster.create({
  className: 'host-thanks-toaster',
  position: Position.TOP,
  maxToasts: 1
});
