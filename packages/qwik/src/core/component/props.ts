export function mergeProps(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source != null) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    }
  }
  return target;
}
