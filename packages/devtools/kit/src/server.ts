import { ClientFunctions, ServerFunctions } from './types';
import { DEVTOOLS_MESSAGES } from './constants';
import { setViteServerRpc, getViteServerContext } from './context';
import { createSerializedRpc } from './rpc-core';

export interface ServerRpcRequestContext {
  client?: unknown;
}

let currentServerRpcRequestContext: ServerRpcRequestContext | undefined;

export function getServerRpcRequestContext() {
  return currentServerRpcRequestContext;
}

function runWithServerRpcRequestContext<T>(context: ServerRpcRequestContext, fn: () => T): T {
  const previous = currentServerRpcRequestContext;
  currentServerRpcRequestContext = context;
  try {
    return fn();
  } finally {
    currentServerRpcRequestContext = previous;
  }
}

// birpc invokes functions after an await; the context lasts until their own first await.
function bindServerRpcRequestContext(_method: string, fn: (...args: unknown[]) => unknown) {
  const context = currentServerRpcRequestContext;
  if (!context || !fn) {
    return fn;
  }
  return function (this: unknown, ...args: unknown[]) {
    return runWithServerRpcRequestContext(context, () => fn.apply(this, args));
  };
}

export function createServerRpc(functions: ServerFunctions) {
  const server = getViteServerContext();

  const rpc = createSerializedRpc<ClientFunctions, ServerFunctions>(functions, {
    post: (data) => server.ws.send(DEVTOOLS_MESSAGES.viteMessagingEvent, data),
    on: (handler) =>
      server.ws.on(DEVTOOLS_MESSAGES.viteMessagingEvent, (data: any, client: unknown) => {
        runWithServerRpcRequestContext({ client }, () => {
          handler(data);
        });
      }),
    resolver: bindServerRpcRequestContext,
  });

  setViteServerRpc(rpc);
}
