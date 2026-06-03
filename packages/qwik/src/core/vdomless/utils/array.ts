export function swapRemove<T>(array: T[], item: T): boolean {
  const index = array.indexOf(item);
  if (index === -1) {
    return false;
  }

  const lastIndex = array.length - 1;
  array[index] = array[lastIndex];
  array.pop();

  return true;
}
