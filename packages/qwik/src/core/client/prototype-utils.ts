export const fastGetter = <T>(prototype: any, name: string): T => {
  let getter: any;
  while (prototype && !(getter = Object.getOwnPropertyDescriptor(prototype, name)?.get)) {
    prototype = Object.getPrototypeOf(prototype);
  }
  return (
    getter ||
    function (this: any) {
      return this[name];
    }
  );
};
