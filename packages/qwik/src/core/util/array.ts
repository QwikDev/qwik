export function flattenArray<T>(array: (T | T[])[], dst?: T[]): T[] {
  // Yes this function is just Array.flat, but we need to run on old versions of Node.
  if (!dst) dst = [];
  for (const item of array) {
    if (Array.isArray(item)) {
      flattenArray(item, dst);
    } else {
      dst.push(item);
    }
  }
  return dst;
}
