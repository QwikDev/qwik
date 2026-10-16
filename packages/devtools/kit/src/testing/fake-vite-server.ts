import SuperJSON from 'superjson';
import { setViteServerContext } from '../context';

type WsListener = (data: unknown, client: unknown) => void;

export interface RpcResponse {
  i: string;
  r?: any;
  e?: unknown;
}

/** Installs a fake Vite websocket and returns a function to call server RPCs as a given client. */
export function connectFakeViteServer() {
  const listeners: WsListener[] = [];
  const pendingCalls = new Map<string, (response: RpcResponse) => void>();
  const server = {
    ws: {
      on: (_event: string, listener: WsListener) => listeners.push(listener),
      send: (_event: string, data: string) => {
        const response = SuperJSON.parse<RpcResponse>(data);
        pendingCalls.get(response.i)?.(response);
        pendingCalls.delete(response.i);
      },
    },
  };
  setViteServerContext(server as any);

  let nextCallId = 0;
  return function callRpcAs(client: unknown, method: string, args: unknown[] = []) {
    return new Promise<RpcResponse>((resolve) => {
      const id = `call-${nextCallId++}`;
      pendingCalls.set(id, resolve);
      const request = SuperJSON.stringify({ t: 'q', i: id, m: method, a: args });
      listeners.forEach((listener) => listener(request, client));
    });
  };
}
