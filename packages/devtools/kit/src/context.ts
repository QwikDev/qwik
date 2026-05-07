import {
  ViteClientContext,
  CLIENT_CTX,
  SERVER_CTX,
  ViteServerContext,
  SERVER_RPC,
  CLIENT_RPC,
} from './globals';
import { ServerRpc, ClientRpc } from './types';
import { createGlobalAccessor } from './global-store';

const clientContextAccessor = createGlobalAccessor<ViteClientContext>(CLIENT_CTX);
const serverContextAccessor = createGlobalAccessor<ViteServerContext>(SERVER_CTX);
const serverRpcAccessor = createGlobalAccessor<ServerRpc>(SERVER_RPC);
const clientRpcAccessor = createGlobalAccessor<ClientRpc>(CLIENT_RPC);

export const getViteClientContext = clientContextAccessor.get;
export const setViteClientContext = clientContextAccessor.set;

export const getViteServerContext = serverContextAccessor.get;
export const setViteServerContext = serverContextAccessor.set;

export const getViteServerRpc = serverRpcAccessor.get;
export const setViteServerRpc = serverRpcAccessor.set;

export const getViteClientRpc = clientRpcAccessor.get;
export const setViteClientRpc = clientRpcAccessor.set;
