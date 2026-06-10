import { _deserialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestEvSharedActionId } from '../request-event-core';
import { IsQAction, QActionId } from '../request-path';
import { ServerError } from '../server-error';
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
  let currentStatus = 200;
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
    error: vi.fn((statusCode: number, data: unknown) => {
      currentStatus = statusCode;
      return new ServerError(statusCode, data);
    }),
    status: vi.fn((statusCode?: number) => {
      if (typeof statusCode === 'number') {
        currentStatus = statusCode;
        return statusCode;
      }
      return currentStatus;
    }),
    json: vi.fn((statusCode: number, data: unknown) => {
      sent.status = statusCode;
      sent.body = JSON.stringify(data);
    }),
    send: vi.fn((statusCode: number, body: string) => {
      sent.status = statusCode;
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

  it('reflects validator failure status in HTTP response', async () => {
    globalThis.__STRICT_LOADERS__ = false;
    const { requestEv, sent } = createActionRequest();

    const action = {
      ...createAction(),
      __validators: [
        {
          validate: vi.fn(async () => ({
            success: false,
            status: 422,
            error: { field: 'name', message: 'too short' },
          })),
        },
      ],
    } as any;

    await actionHandler([action])(requestEv as any);

    expect(sent.status).toBe(422);
    const response = _deserialize<{ result?: unknown; error?: any }>(sent.body!);
    expect(response.result).toBeUndefined();
    expect(response.error).toMatchObject({
      status: 422,
      data: { field: 'name', message: 'too short' },
    });
  });

  it('reflects thrown error() status from action QRL in HTTP response', async () => {
    globalThis.__STRICT_LOADERS__ = false;
    const { requestEv, sent } = createActionRequest();

    const action = {
      __brand: 'server_action',
      __id: 'action-a',
      __validators: undefined,
      __invalidate: undefined,
      __qrl: {
        getHash: () => 'action-a',
        // First arg is requestEv; the action throws error() to signal failure.
        call: vi.fn(async (ev: any) => {
          throw ev.error(500, { msg: 'something went wrong' });
        }),
      },
    } as any;

    await actionHandler([action])(requestEv as any);

    expect(sent.status).toBe(500);
    const response = _deserialize<{ result?: unknown; error?: any }>(sent.body!);
    expect(response.result).toBeUndefined();
    expect(response.error).toMatchObject({ status: 500, data: { msg: 'something went wrong' } });
  });
});
