import { NEEDS_COMPUTATION, STORE_ALL_PROPS } from '../../reactive/constants';
import { _UNINITIALIZED } from '../utils/constants';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
// Keep last
import { Slot } from '../../dom/slot/slot';
import { Fragment } from '../jsx/compiler-runtime';
export { TypeIds } from './type-id';
import { TypeIds } from './type-id';

/** Used to represent an undefined value that must be serialized */
export const explicitUndefined = Symbol('undefined');
export const EMPTY_OBJECT_PAYLOAD = 0;

export const enum Constants {
  Undefined,
  Null,
  True,
  False,
  EmptyString,
  EMPTY_ARRAY,
  EMPTY_OBJ,
  NEEDS_COMPUTATION,
  STORE_ALL_PROPS,
  UNINITIALIZED,
  Slot,
  Fragment,
  NaN,
  PositiveInfinity,
  NegativeInfinity,
  MaxSafeInt,
  // used for close fragment
  AlmostMaxSafeInt,
  MinSafeInt,
  Colon,
  Dot,
  Id,
  Ref,
}

// Used for allocate, make sure they are in sync with Constants
export const _constants = [
  undefined,
  null,
  true,
  false,
  '',
  EMPTY_ARRAY,
  EMPTY_OBJ,
  NEEDS_COMPUTATION,
  STORE_ALL_PROPS,
  _UNINITIALIZED,
  Slot,
  Fragment,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER - 1,
  Number.MIN_SAFE_INTEGER,
  ':',
  '.',
  'id',
  'ref',
] as const;

// Used for dumpState, make sure they are in sync with Constants

/** Arrays/Objects are special-cased so their identifiers is a single digit. */
export const needsInflation = (typeId: TypeIds) =>
  typeId >= TypeIds.Error ||
  typeId === TypeIds.Array ||
  typeId === TypeIds.Object ||
  typeId === TypeIds.SerializerSignal;
