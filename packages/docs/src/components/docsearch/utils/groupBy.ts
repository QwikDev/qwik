export function groupBy<TValue extends Record<string, unknown>>(
  values: TValue[],
  predicate: (value: TValue) => string
): Record<string, TValue[]> {
  return values.reduce<Record<string, TValue[]>>((acc, item) => {
    const key = predicate(item);

    if (!acc.hasOwnProperty(key)) {
      acc[key] = [];
    }

    // We limit each section to show 5 hits maximum.
    // This acts as a frontend alternative to `distinct`.
    if (acc[key].length < 5) {
      acc[key].push(item);
    }

    return acc;
  }, {});
}
