import { type NumericPropKey } from './numeric-prop-key';

export const enum NumericPropKeyFlags {
  EVENT = 1,
  Q_PREFIX = 2,
  START_WITH_COLON = 4,
  SLOT = 8,
}

export const NumericFlagsShift = 4;

function getFlags(id: number) {
  return ((1 << NumericFlagsShift) - 1) & (id >> 0);
}

export function isEventProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.EVENT) !== 0;
}

export function isQProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.Q_PREFIX) !== 0;
}

export function startsWithColon(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.START_WITH_COLON) !== 0;
}

export function isSlotProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.SLOT) !== 0;
}
