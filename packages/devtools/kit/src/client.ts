import { ClientFunctions, ServerFunctions } from './types';
import { DEVTOOLS_VITE_MESSAGING_EVENT } from './constants';
import { getViteClientContext, setViteClientRpc } from './context';
import { createSerializedRpc } from './rpc-core';

export function createClientRpc(functions: ClientFunctions) {
  const client = getViteClientContext();

  const rpc = createSerializedRpc<ServerFunctions, ClientFunctions>(functions, {
    post: (data) => client.send(DEVTOOLS_VITE_MESSAGING_EVENT, data),
    on: (handler) =>
      client.on(DEVTOOLS_VITE_MESSAGING_EVENT, (data) => {
        handler(data);
      }),
  });

  setViteClientRpc(rpc);
}
