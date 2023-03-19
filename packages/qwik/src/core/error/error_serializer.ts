/**
 * This file enables the serialization and deserialization of Errors and Custom Errors
 * Optimized to serialize and deserialize standard native Errors as fast as possible.
 */

export const serializeError = (error: any) => {
  // Serialize Native Error
  if (Object.keys(error).length === 0) return `{"__qName": "Error","message":"${error.message}"}`; // Keep it screamin' fast! (IN) <--- This is the most common case

  // Serialize Custom Error / Object with errors
  return JSON.stringify(cloneErrorPrimitives(error));
};

export const deserializeError = (serializedError: string) => {
  // Deserialize Native Error
  const errPrims = JSON.parse(serializedError);
  if (errPrims.__qName == 'Error' && !errPrims.__qDeep)
    return Object.assign(new Error(errPrims.message), { stack: undefined }); // Keep it screamin' fast! (OUT) <--- This is the most common case

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

const cloneErrorPrimitives = (obj: any): any => {
  const __qDeep: string[] = [];

  function clone(obj: any, path: string | undefined = undefined, cache: Set<any> = new Set()) {
    if (obj === null || typeof obj !== 'object' || typeof obj === 'function') return obj;

    // Prevent circular-references
    if (cache.has(obj)) return;
    cache.add(obj);

    // Clone the object, "stack" is automatically removed (somehow magically)
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
  }

  const clonedErr = clone(obj);
  __qDeep.length > 0 && (clonedErr.__qDeep = __qDeep!);
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
    class DynamicError extends Error {
      constructor(message: string) {
        super(message);
        this.name = className;
        delete this.stack;
      }
    }
    instance = new DynamicError(errorMessage);
  } else {
    // Create a dynamic class
    class DynamicClass {
      constructor() {}
    }
    instance = new DynamicClass();
  }

  Object.defineProperty(instance, 'name', { value: className });
  return instance;
};
