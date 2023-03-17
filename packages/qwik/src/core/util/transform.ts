/**
 * Convert a function to a string, optionally executing it.
 * @param fn - Function to convert
 * @param execute - Whether to execute the function
 * @returns String
 * @public
 * @remarks arrow functions are not supported
 */
export const functionToString = (fn: Function, execute = true): string => {
  let toStr = fn.toString();

  // No support for arrow functions as they don't have a name.
  if (!toStr.startsWith('function')) {
    throw new Error('Arrow functions are not supported');
  }

  if (execute) {
    const functionName = fn.name;
    toStr = `${toStr}\n${functionName ? functionName + '();' : ''}`;
  }
  return toStr.replace(/\s+/g, ' ').trim() + '\n';
};

/**
 * Combine a list of functions or strings into a single string, optionally
 * executing them in the order they are passed in.
 *
 * @param fns - List of functions or strings
 * @param execute - Whether to execute the functions
 * @returns String
 * @public
 */
export const combineInlines = (fns: (string | Function)[], execute = true): string => {
  const toStr = fns.reduce((acc: string, fn: string | Function) => {
    if (typeof fn === 'function') {
      return `${acc}${functionToString(fn, execute)}`;
    } else if (typeof fn === 'string') {
      return `${acc} ${fn}`;
    }
    throw new Error('Invalid argument type for combineInlines');
  }, '');

  return toStr.replace(/\s+/g, ' ').trim() + '\n';
};
