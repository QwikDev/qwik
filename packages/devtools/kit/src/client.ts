import { ClientFunctions, ServerFunctions } from './types';
import { DEVTOOLS_MESSAGES } from './constants';
import { getViteClientContext, setViteClientRpc } from './context';
import { createSerializedRpc } from './rpc-core';

export function createClientRpc(functions: ClientFunctions) {
  const client = getViteClientContext();

  const rpc = createSerializedRpc<ServerFunctions, ClientFunctions>(functions, {
    post: (data) => client.send(DEVTOOLS_MESSAGES.viteMessagingEvent, data),
    on: (handler) =>
      client.on(DEVTOOLS_MESSAGES.viteMessagingEvent, (data) => {
        handler(data);
      }),
  });

  setViteClientRpc(rpc);
}
