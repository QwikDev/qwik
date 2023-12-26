/** @file Shared types */

export type Stringifyable = string | boolean | number | null;

export function isStringifyable(value: any): value is Stringifyable {
  return (
    value === 'null' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
