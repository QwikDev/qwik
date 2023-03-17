/**
 * This file enables the serialization and deserialization of Errors and Custom Errors
 * Optimized to serialize and deserialize standard native Errors as fast as possible.
 */

export const serializeError = (error: any) => {
  // Serialize Native Error
  if (Object.keys(error).length === 0)
    return `{"__constructorName": "Error","message":"${error.message}"}`; // Keep it screamin' fast! (IN) <--- This is the most common case

  // Serialize Custom Error / Object with errors
  return JSON.stringify(cloneErrorPrimitives(error));
};

export const deserializeError = (serializedError: string) => {
  // Deserialize Native Error
  const errPrims = JSON.parse(serializedError);
  if (errPrims.__constructorName == 'Error' && !errPrims.__deepClasses)
    return Object.assign(new Error(errPrims.message), { stack: undefined }); // Keep it screamin' fast! (OUT) <--- This is the most common case

  // Deserialize Custom Error
  if (typeof errPrims === 'object' && errPrims !== null) {
    const { message, __constructorName, __instanceOfError, __deepClasses, stack, ...rest }: any =
      errPrims;
    stack;
    const classOrObject = makeSafeClassOrObjectInstance(
      __constructorName,
      __instanceOfError && message
    );
    Object.assign(classOrObject, rest);
    // delete error.stack;
    __deepClasses && deserializeDeepClasses(classOrObject, __deepClasses);
    return classOrObject;
  }

  throw new Error(`Unable to deserialize error: ${serializedError}`); // Whoops!
};

const cloneErrorPrimitives = (obj: any): any => {
  const __deepClasses: string[] = [];

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

    // If instance of Error, add message and __constructorName
    if (obj.constructor.name && obj.constructor !== Object) {
      path && __deepClasses.push(path);
      clonedObj.message = obj.message;
      clonedObj.__constructorName = obj.constructor.name;
      obj instanceof Error && (clonedObj.__instanceOfError = true);
    }

    return clonedObj;
  }

  const clonedErr = clone(obj);
  __deepClasses.length > 0 && (clonedErr.__deepClasses = __deepClasses!);
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
      if (deepErrObj.__constructorName) {
        const { message, __constructorName, __instanceOfError, stack, ...rest }: any = deepErrObj;
        stack;
        const classOrObject = makeSafeClassOrObjectInstance(
          __constructorName,
          __instanceOfError && message
        );
        Object.assign(classOrObject, rest);
        // delete error.stack;
        parentObj[objKey] = classOrObject;
      }
    }
  });
};

// export const makeSafeClassOrObjectInstance = (className: string, errorMessage?: string) => {
//   if (className === 'Error') return Object.assign(new Error(errorMessage), { stack: undefined }); // Keep it screamin' fast! <--- This is the most common case

//   // INECTION PROTECTION! If not a valid classname, return a plain object
//   if (!className || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(className)) return {};

//   // Create a dynamic class or extends Error
//   const cObj: any = {};
//   const errEval = `cObj.DynamicClass = class ${className} extends Error {constructor() {super('${errorMessage}');this.name = '${className}';delete this.stack;}}`;
//   errorMessage ? eval(errEval) : eval(`cObj.DynamicClass = class ${className} {constructor() {}}`);
//   const instance = new cObj.DynamicClass(errorMessage);
//   return instance;
// };

export const makeSafeClassOrObjectInstance = (className: string, errorMessage?: string) => {
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
