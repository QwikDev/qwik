/**
 * Creates a function that schedules `fn` to run as a microtask. Microtasks run before browser
 * paint, preventing flickering.
 */
export const createMicroTask = (fn: () => void) => {
  return () => queueMicrotask(fn);
};

export interface MacroTask {
  (): void;
  $destroy$?: () => void;
}

/**
 * Creates a function that schedules `fn` to run as a macrotask. Macrotasks yield to the browser,
 * allowing paint and user input. Used for time-slicing to avoid blocking the main thread.
 */
export const createMacroTask = (fn: () => void): MacroTask => {
  let macroTask: MacroTask;
  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    let active = true;
    channel.port1.onmessage = () => fn();
    macroTask = () => {
      if (active) {
        channel.port2.postMessage(null);
      }
    };
    macroTask.$destroy$ = () => {
      if (active) {
        active = false;
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
      }
    };
  } else {
    macroTask = () => setTimeout(fn);
  }
  return macroTask;
};
