/** @file Shared types */

export type Stringifiable = string | boolean | number | null;

export function isStringifiable(value: any): value is Stringifiable {
  return (
    value === 'null' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}
