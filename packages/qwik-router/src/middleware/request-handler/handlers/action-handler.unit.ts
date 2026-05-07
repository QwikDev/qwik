import { _deserialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestEvSharedActionId } from '../request-event-core';
import { IsQAction, QActionId } from '../request-path';
import { actionHandler } from './action-handler';

const previousStrictLoaders = globalThis.__STRICT_LOADERS__;

afterEach(() => {
  globalThis.__STRICT_LOADERS__ = previousStrictLoaders;
  vi.restoreAllMocks();
});

const createAction = (invalidate?: string[]) =>
  ({
    __brand: 'server_action',
    __id: 'action-a',
    __validators: undefined,
    __invalidate: invalidate,
    __qrl: {
      getHash: () => 'action-a',
      call: vi.fn(async (_event: unknown, data: unknown) => ({ ok: data })),
    },
  }) as any;

const createActionRequest = () => {
  const sent = {
    status: undefined as number | undefined,
    body: undefined as string | undefined,
  };
  const request = new Request('http://localhost/test/?qaction=action-a', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
  });
  const requestEv = {
    sharedMap: new Map<string, unknown>([
      [IsQAction, true],
      [QActionId, 'action-a'],
    ]),
    request,
    method: 'POST',
    headers: new Headers(),
    headersSent: false,
    exited: false,
    parseBody: vi.fn(async () => ({ name: 'Ada' })),
    fail: vi.fn((status: number, data: Record<string, unknown>) => ({
      failed: true,
      status,
      ...data,
    })),
    json: vi.fn((status: number, data: unknown) => {
      sent.status = status;
      sent.body = JSON.stringify(data);
    }),
    send: vi.fn((status: number, body: string) => {
      sent.status = status;
      sent.body = body;
    }),
  };
  return { requestEv, sent };
};

describe('actionHandler', () => {
  it('returns only the action result when loaders should all invalidate on the client', async () => {
    globalThis.__STRICT_LOADERS__ = false;
    const { requestEv, sent } = createActionRequest();

    await actionHandler([createAction()])(requestEv as any);

    const response = _deserialize<Record<string, unknown>>(sent.body!);
    expect(sent.status).toBe(200);
    expect(response).toEqual({ result: { ok: { name: 'Ada' } } });
    expect(response).not.toHaveProperty('loaders');
    expect(response).not.toHaveProperty('loaderHashes');
    expect(requestEv.sharedMap.get(RequestEvSharedActionId)).toBe('action-a');
  });

  it('returns explicit loader hashes without loader values', async () => {
    globalThis.__STRICT_LOADERS__ = false;
    const { requestEv, sent } = createActionRequest();

    await actionHandler([createAction(['loader-a', 'loader-b'])])(requestEv as any);

    const response = _deserialize<Record<string, unknown>>(sent.body!);
    expect(response).toEqual({
      result: { ok: { name: 'Ada' } },
      loaderHashes: ['loader-a', 'loader-b'],
    });
    expect(response).not.toHaveProperty('loaders');
  });

  it('returns empty loader hashes for strict mode actions without explicit invalidate', async () => {
    globalThis.__STRICT_LOADERS__ = true;
    const { requestEv, sent } = createActionRequest();

    await actionHandler([createAction()])(requestEv as any);

    const response = _deserialize<Record<string, unknown>>(sent.body!);
    expect(response).toEqual({
      result: { ok: { name: 'Ada' } },
      loaderHashes: [],
    });
    expect(response).not.toHaveProperty('loaders');
  });
});
