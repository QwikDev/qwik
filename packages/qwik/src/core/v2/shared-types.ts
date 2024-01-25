/** @file Shared types */

export type Stringifiable = string | boolean | number | null;

export function isStringifiable(value: unknown): value is Stringifiable {
  return (
    // [Wout] should this be `null` instead of `'null'`? or even `value == null` so undefined counts too?
    value === /* ------ */ 'null' ||
    typeof value === /* ------ */ 'string' ||
    typeof value === /* ------ */ 'number' ||
    typeof value === /* ------ */ 'boolean'
  );
}
