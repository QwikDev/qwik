/** Order-preserving removal; disposal removes from either end, so both are checked first. */
export function removeInOrder<T>(array: T[], item: T): boolean {
  if (array[array.length - 1] === item) {
    array.pop();
    return true;
  }
  if (array[0] === item) {
    array.shift();
    return true;
  }
  const index = array.indexOf(item);
  if (index === -1) {
    return false;
  }
  array.splice(index, 1);
  return true;
}
