import { _deserializeData } from '@builder.io/qwik';

globalThis.document = {
  nodeType: 9,
  ownerDocument: undefined,
  dispatchEvent() {
    return true;
  },
  createElement() {
    return {
      nodeType: 1,
    };
  },
};

globalThis.onmessage = async ({ data }) => {
  const requestId = data[0];
  const baseURI = data[1];
  const qBase = data[2];
  const containerEl = {
    nodeType: 1,
    ownerDocument: {
      baseURI,
    },
    closest() {
      return containerEl;
    },
    getAttribute(name) {
      return name === 'q:base' ? qBase : undefined;
    },
  };
  try {
    const [qrl, ...args] = _deserializeData(data[3], containerEl);
    const output = await qrl.apply(undefined, args);
    self.postMessage([requestId, true, output]);
  } catch (err) {
    self.postMessage([requestId, false, err]);
    return;
  }
};
