// This can't be in platform.ts because it uses MessageChannel which cannot post messages with functions
// TODO: move this to platform.ts somehow
export const createNextTick = (fn: () => void) => {
  let nextTick: () => void;
  // according to the https://developer.mozilla.org/en-US/docs/Web/API/Window/setImmediate#notes
  if (typeof setImmediate === 'function') {
    // setImmediate is the fastest way to schedule a task, but works only in node.js
    nextTick = () => {
      setImmediate(fn);
    };
  } else if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      fn();
    };
    nextTick = () => {
      channel.port2.postMessage(null);
    };
  } else {
    // setTimeout is a fallback, creates 4ms delay
    nextTick = () => {
      setTimeout(fn);
    };
  }

  return nextTick;
};
