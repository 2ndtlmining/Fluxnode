import { Toaster, Position } from '@blueprintjs/core';

export const AppToaster = Toaster.create({
  className: '',
  position: Position.BOTTOM_LEFT,
  maxToasts: 7
});
