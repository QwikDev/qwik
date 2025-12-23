/**
 * Creates a function that schedules `fn` to run as a microtask. Microtasks run before browser
 * paint, preventing flickering.
 */
export const createMicroTask = (fn: () => void) => {
  return () => queueMicrotask(fn);
};

/**
 * Creates a function that schedules `fn` to run as a macrotask. Macrotasks yield to the browser,
 * allowing paint and user input. Used for time-slicing to avoid blocking the main thread.
 */
export const createMacroTask = (fn: () => void) => {
  let macroTask: () => void;
  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => fn();
    macroTask = () => channel.port2.postMessage(null);
  } else {
    macroTask = () => setTimeout(fn);
  }
  return macroTask;
};
