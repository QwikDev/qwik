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

/**
 * Creates a cached fast property accessor by pulling the native getter from the prototype chain.
 * The getter is resolved lazily on the first call and then reused, bypassing prototype lookups on
 * every subsequent access.
 *
 * @example const fastNodeType = createFastGetter<Node, number>('nodeType'); const
 * fastOwnerDocument = createFastGetter<Node, Document>('ownerDocument');
 */
export const createFastGetter = <This extends object, R>(propName: string): ((node: This) => R) => {
  let getter: ((this: This) => R) | null = null;
  return (node: This): R => {
    if (!getter) {
      getter = fastGetter<(this: This) => R>(node, propName)!;
    }
    return getter.call(node);
  };
};
