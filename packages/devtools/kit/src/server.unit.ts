import { describe, expect, test } from 'vitest';
import { createServerRpc, getServerRpcRequestContext } from './server';
import { connectFakeViteServer } from './testing/fake-vite-server';
import type { ServerFunctions } from './types';

describe('createServerRpc', () => {
  test('exposes the calling websocket client to the invoked function', async () => {
    const callRpcAs = connectFakeViteServer();
    const client = { socket: { remoteAddress: '127.0.0.1' } };

    createServerRpc({
      healthCheck: () => getServerRpcRequestContext()?.client === client,
    } as unknown as ServerFunctions);

    expect((await callRpcAs(client, 'healthCheck')).r).toBe(true);
  });
});
