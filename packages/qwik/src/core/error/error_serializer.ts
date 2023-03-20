/**
 * This file enables the serialization and deserialization of Errors and Custom Errors
 * Optimized to serialize and deserialize standard native Errors as fast as possible.
 */

export const serializeError = (error: any) => {
  // Serialize Native Error
  if (Object.keys(error).length === 0) {
    // It's shallow error -- Keep it screamin' fast! (IN) <--- This is the most common
    return error.constructor.name === 'Error'
      ? `{"message":"${error.message}"}`
      : `{"__qName": "${error.constructor.name}", "__qIsError": "true", "message":"${error.message}"}`;
  }

  // Serialize Custom Error / Object with errors
  return JSON.stringify(cloneError(error));
};

export const deserializeError = (serializedError: string) => {
  // Deserialize Native Error
  const errPrims = JSON.parse(serializedError);

  // If there is only one key, we must have a shallow native error message
  // Keep it screamin' fast! (OUT) <--- This is the most common case
  if (Object.keys(errPrims).length === 1)
    return Object.assign(new Error(errPrims.message), { stack: undefined });

  // Deserialize Custom Error
  if (typeof errPrims === 'object' && errPrims !== null) {
    const { message, __qName, __qIsError, __qDeep, stack, ...rest }: any = errPrims;
    stack;
    const classOrObject = __qName ? makeClassInstance(__qName, __qIsError && message) : {};
    Object.assign(classOrObject, rest);
    // delete error.stack;
    __qDeep && deserializeDeepClasses(classOrObject, __qDeep);
    return classOrObject;
  }

  throw new Error(`Unable to deserialize error: ${serializedError}`); // Whoops!
};

const cloneError = (obj: any): any => {
  const __qDeep: string[] = [];

  const clone = (obj: any, path: string | undefined = undefined, cache: Set<any> = new Set()) => {
    if (obj === null || typeof obj !== 'object' || typeof obj === 'function') return obj;

    // Prevent circular-references
    if (cache.has(obj)) return;
    cache.add(obj);

    // Clone the object, "stack" is automagically removed
    const clonedObj: any = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clonedObj[key] = clone(obj[key], path ? `${path}.${key}` : key, cache); // Recursively clone
      }
    }

    // If instance of Error, add message and __qName
    if (obj.constructor.name && obj.constructor !== Object) {
      path && __qDeep.push(path);
      clonedObj.message = obj.message;
      clonedObj.__qName = obj.constructor.name;
      obj instanceof Error && (clonedObj.__qIsError = true);
    }

    return clonedObj;
  };

  const clonedErr = clone(obj);
  __qDeep.length ? (clonedErr.__qDeep = __qDeep) : delete clonedErr.__qDeep; // If no error paths, clear residual flag
  return clonedErr;
};

const deserializeDeepClasses = (obj: any, deepClassPaths: string[] | undefined) => {
  deepClassPaths?.forEach((path) => {
    const pathKeys = path.split('.');

    // For speed, don't traverse the object, jump directly to the deep error
    let parentObj: any;
    let objKey: string | undefined;
    let deepErrObj = obj;
    pathKeys.forEach((key, i) => {
      objKey = key;
      parentObj = deepErrObj;
      deepErrObj = deepErrObj[pathKeys[i]];
    });

    // Rebuild the object with Error instance
    if (objKey) {
      if (deepErrObj.__qName) {
        const { message, __qName, __qIsError, stack, ...rest }: any = deepErrObj;
        stack;
        const classOrObject = __qName ? makeClassInstance(__qName, __qIsError && message) : {};
        Object.assign(classOrObject, rest);
        // delete error.stack;
        parentObj[objKey] = classOrObject;
      }
    }
  });
};

export const makeClassInstance = (className: string, errorMessage?: string) => {
  if (className === 'Error') return Object.assign(new Error(errorMessage), { stack: undefined }); // Keep it screamin' fast! <--- This is the most common case
  let instance: any;
  if (errorMessage) {
    // Create a dynamic error
    class DeserializedError extends Error {
      constructor(message: string) {
        super(message);
        this.name = className;
        delete this.stack;
      }
    }
    instance = new DeserializedError(errorMessage);
  } else {
    // Create a dynamic class
    class DeserializedClass {
      constructor() {}
    }
    instance = new DeserializedClass();
  }

  Object.defineProperty(instance, 'name', { value: className });
  return instance;
};
