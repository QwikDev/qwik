import { ClientFunctions, ServerFunctions } from './types';
import { DEVTOOLS_VITE_MESSAGING_EVENT } from './constants';
import { setViteServerRpc, getViteServerContext } from './context';
import { createSerializedRpc } from './rpc-core';

export interface ServerRpcRequestContext {
  client?: unknown;
}

let currentServerRpcRequestContext: ServerRpcRequestContext | undefined;

export function getServerRpcRequestContext() {
  return currentServerRpcRequestContext;
}

function runWithServerRpcRequestContext(context: ServerRpcRequestContext, fn: () => void) {
  const previous = currentServerRpcRequestContext;
  currentServerRpcRequestContext = context;
  try {
    fn();
  } finally {
    currentServerRpcRequestContext = previous;
  }
}

export function createServerRpc(functions: ServerFunctions) {
  const server = getViteServerContext();

  const rpc = createSerializedRpc<ClientFunctions, ServerFunctions>(functions, {
    post: (data) => server.ws.send(DEVTOOLS_VITE_MESSAGING_EVENT, data),
    on: (handler) =>
      server.ws.on(DEVTOOLS_VITE_MESSAGING_EVENT, (data: any, client: unknown) => {
        runWithServerRpcRequestContext({ client }, () => {
          handler(data);
        });
      }),
  });

  setViteServerRpc(rpc);
}
