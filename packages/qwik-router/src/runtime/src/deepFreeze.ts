export const deepFreeze = (obj: any) => {
  if (obj == null) {
    return obj;
  }
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = obj[prop];
    // we assume that a frozen object is a circular reference and fully deep frozen
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
};
