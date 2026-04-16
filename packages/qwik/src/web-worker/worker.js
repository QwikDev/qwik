import { _deserialize } from '@qwik.dev/core';

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
  try {
    const [qrl, ...args] = _deserialize(data[1]);
    const output = await qrl.apply(undefined, args);
    self.postMessage([requestId, true, output]);
  } catch (err) {
    self.postMessage([requestId, false, err]);
    return;
  }
};
