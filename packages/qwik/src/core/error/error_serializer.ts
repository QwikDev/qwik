/**
 * This file enables the serialization and deserialization
 * of Error objects and custom error objects. It supports
 * nested errors for systems that require this, such as GraphQL
 * libraries. Stack traces and circular referenes are omitted.
 */

/**
 * Serialize an error object into a string, removing
 * stack traces and circular references.
 *
 * @param error
 * @returns serialized error as a string
 */
export const serializeError = (error: any) => {
  const errPrims = cloneErrorPrimitives(error);
  return JSON.stringify(errPrims);
};

/**
 * Deserialize an error object from a string,
 * removes unnecessary fields and rebuilds
 * nested error objects, before returning a
 * new Error object.
 *
 * @param serializedError
 * @returns
 */
export const deserializeError = (serializedError: string) => {
  const errPrims = JSON.parse(serializedError);

  if (typeof errPrims === 'object' && errPrims !== null) {
    // Get what we need and jettison the rest
    const { __errMessage, __deepErrors, stack, ...rest }: any = errPrims;
    const error = new Error(__errMessage);
    Object.assign(error, rest);
    delete error.stack;

    if (__deepErrors) {
      // Rebuild the deep errors
      deserializeDeepErrors(error, errPrims.__deepErrors);
    }

    return error;
  }

  throw new Error(`Unable to deserialize error: ${serializedError}`);
};

/**
 * Recursively extract primitive values from an object or array,
 * including handling of circular references and pruning the
 * stack trace from Error objects, and returns a new object with
 * only primitive values.
 */
const cloneErrorPrimitives = (obj: any): any => {
  const __deepErrors = Array<string>();

  const clone = (
    obj: any,
    path: string | undefined = undefined,
    cache: Set<any> = new Set()
  ): any => {
    if (obj === null || typeof obj !== 'object' || typeof obj === 'function') {
      // If the object is a primitive type or null or function, return it
      return obj;
    }

    // If the object has already been processed, return it
    if (cache.has(obj)) return;

    // Add the object to the cache
    cache.add(obj);

    const clonedObj: any = Array.isArray(obj) ? [] : {};

    const isError = obj instanceof Error;
    for (const key in obj) {
      if (isError && key == 'stack') continue; // Not needed, just to be safe
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Recursively clone each property of the object
        clonedObj[key] = clone(obj[key], path ? `${path}.${key}` : key, cache);
      }
    }

    // If the object is an Error, add a special property to the clone
    // and add the path to the __deepErrors array
    if (isError) {
      path && __deepErrors.push(path);
      clonedObj.__errMessage = obj.message;
    }

    return clonedObj;
  };

  const clonedErr = clone(obj);
  clonedErr.__deepErrors = __deepErrors;
  return clonedErr;
};

/**
 * Rebuild any nested Error objects that were serialized
 * and inserts them back into the appropriate locations
 * within the parent Error object. Stack trace and circular
 * refereces are omitted.
 *
 * @param obj
 * @param deepErrorPaths
 */
const deserializeDeepErrors = (obj: any, deepErrorPaths: string[] | undefined) => {
  deepErrorPaths?.forEach((path) => {
    const pathKeys = path.split('.');

    // Traverse the object to the deep error
    let parentObj: any;
    let objKey: string | undefined;
    let deepErrObj = obj;
    pathKeys.forEach((key, i) => {
      objKey = key;
      parentObj = deepErrObj;
      deepErrObj = deepErrObj[pathKeys[i]];
    });

    // Rebuild the object with an Error instance
    if (objKey) {
      const { __errMessage, stack, ...rest }: any = deepErrObj;
      const deepError = new Error(__errMessage);
      delete deepError.stack;
      Object.assign(deepError, rest);
      parentObj[objKey] = deepError;
    }
  });
};

/**
* THIS IS A VALIDATION OBJECT FOR TESTING
*
  const validate = {
    e1: new Error("Standard Error"),
    c: {},
    o: {
      e2: new CustomError("Custom Error", {
        e3: new Error("Super Deep Standard Error"),
      }),
      c: {},
      stack: "keep me",
      n: null,
      b: true,
      v: 123,
      s: "abc",
      u: undefined,
      f: () => "function!",
    },
    stack: "keep me",
    n: null,
    b: true,
    v: 123,
    s: "abc",
    u: undefined,
    f: () => "function!"
  };
  validate.c = validate;
  validate.o.c = validate;
 
*/
