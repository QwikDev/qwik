import SuperJSON from 'superjson';
import { createBirpc } from 'birpc';

interface RpcChannel {
  post: (serialized: string) => void;
  on: (handler: (serialized: string) => void) => void;
}

const RPC_TIMEOUT = 120_000;

function parseRpcPayload(payload: unknown) {
  return SuperJSON.parse(String(payload));
}

export function createSerializedRpc<RemoteFunctions extends object, LocalFunctions extends object>(
  functions: LocalFunctions,
  channel: RpcChannel
) {
  return createBirpc<RemoteFunctions, LocalFunctions>(functions, {
    post: (data) => channel.post(SuperJSON.stringify(data)),
    on: (handler) => channel.on((data) => handler(parseRpcPayload(data))),
    timeout: RPC_TIMEOUT,
  });
}
