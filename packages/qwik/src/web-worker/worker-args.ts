type BrowserGlobals = typeof globalThis & {
  Event?: typeof Event;
  HTMLFormElement?: typeof HTMLFormElement;
  Node?: typeof Node;
  SubmitEvent?: typeof SubmitEvent;
};

const browserGlobals = globalThis as BrowserGlobals;

export const sanitizeWorkerArgs = (args: any[]): any => {
  const SubmitEventConstructor = browserGlobals.SubmitEvent;
  const HTMLFormElementConstructor = browserGlobals.HTMLFormElement;
  const EventConstructor = browserGlobals.Event;
  const NodeConstructor = browserGlobals.Node;

  const sanitizedArgs = new Array(args.length);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (
      SubmitEventConstructor &&
      HTMLFormElementConstructor &&
      arg instanceof SubmitEventConstructor &&
      arg.target instanceof HTMLFormElementConstructor
    ) {
      sanitizedArgs[i] = new FormData(arg.target);
    } else if (EventConstructor && arg instanceof EventConstructor) {
      sanitizedArgs[i] = null;
    } else if (NodeConstructor && arg instanceof NodeConstructor) {
      sanitizedArgs[i] = null;
    } else {
      sanitizedArgs[i] = arg;
    }
  }
  return sanitizedArgs;
};
