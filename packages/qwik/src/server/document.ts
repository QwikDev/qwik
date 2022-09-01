export function createEl(tagName: string, doc: Document) {
  return {
    nodeType: tagName === ':virtual' ? 111 : 1,
    nodeName: tagName.toUpperCase(),
    localName: tagName,
    ownerDocument: doc,
    isConnected: true,
    _qc_: null,
    __virtual: null,
    'q:id': null,
  };
}

export interface ServerDocument {
  nodeType: 9;
  parentElement: null;
  ownerDocument: null;
  createElement(tagName: string): any;
}

/**
 * Create emulated `Document` for server environment. Does not implement the full browser
 * `document` and `window` API. This api may be removed in the future.
 * @internal
 */
export function createSimpleDocument() {
  const doc = {
    nodeType: 9,
    parentElement: null,
    ownerDocument: null,
    createElement(tagName: string): any {
      return createEl(tagName, doc as any);
    },
  };
  return doc;
}
