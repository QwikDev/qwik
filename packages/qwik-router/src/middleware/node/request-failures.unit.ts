import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _setRouterConfig } from '../../runtime/src/router-config';
import type { RequestEvent } from '../../runtime/src/types';
import { ServerError } from '../request-handler/server-error';

vi.mock('@qwik.dev/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qwik.dev/core')>()),
  isDev: false,
}));

vi.mock('@qwik.dev/core/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qwik.dev/core/internal')>()),
  isDev: false,
}));

import { createQwikRouter } from './index';

const routeState = { module: {} as Record<string, unknown> };

_setRouterConfig({
  routes: { _I: async () => routeState.module },
  cacheModules: false,
  basePathname: '/',
  fallthrough: false,
} as any);

const FIRST_CHUNK = '<!DOCTYPE html><html q:container="paused">';

const renderFirstChunkThenThrow = (thrown: unknown) =>
  vi.fn(async (opts: any) => {
    await opts.stream.write(FIRST_CHUNK);
    throw thrown;
  });

const renderNothing = vi.fn();

describe('request failures through the node middleware', () => {
  const servers: Server[] = [];

  const request = async (render: unknown) => {
    const next = vi.fn();
    const endedWhenNextRan: boolean[] = [];
    const handled: Promise<void>[] = [];
    const { router } = createQwikRouter({ render } as any);
    const server = createServer((req, res) => {
      handled.push(
        router(req, res, (err) => {
          endedWhenNextRan.push(res.writableEnded);
          next(err);
        })
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });
    const body = await response.text();
    await Promise.all(handled);

    return { body, endedWhenNextRan, next, status: response.status };
  };

  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    routeState.module = { default: () => null };
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleError.mockRestore();
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
          })
      )
    );
  });

  it('a render crash after the first chunk reaches next and the response ends', async () => {
    const crash = new Error('render failed');

    const { body, next, status } = await request(renderFirstChunkThenThrow(crash));

    expect(status).toBe(200);
    expect(body).toContain(FIRST_CHUNK);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(crash);
    expect(consoleError).toHaveBeenCalledWith(crash);
  });

  it('forwards a middleware crash that got the 500 page to next', async () => {
    const crash = new Error('middleware failed');
    routeState.module = {
      default: () => null,
      onGet: () => {
        throw crash;
      },
    };

    const { body, next, status } = await request(renderNothing);

    expect(status).toBe(500);
    expect(body).toContain('Internal Server Error');
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(crash);
    expect(consoleError).toHaveBeenCalledWith(crash);
  });

  it('ends a response a crash left open before calling next', async () => {
    const crash = new Error('stream failed');
    routeState.module = {
      onGet: async (ev: RequestEvent) => {
        const writer = ev.getWritableStream().getWriter();
        await writer.write(new TextEncoder().encode('partial'));
        throw crash;
      },
    };

    const { body, endedWhenNextRan, next, status } = await request(renderNothing);

    expect(status).toBe(200);
    expect(body).toBe('partial');
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(crash);
    expect(endedWhenNextRan).toEqual([true]);
  });

  it('forwards a ServerError thrown after headers were sent', async () => {
    const lateError = new ServerError(404, 'No such order');

    const { next, status } = await request(renderFirstChunkThenThrow(lateError));

    expect(status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(lateError);
  });

  it('does not call next for a redirect', async () => {
    routeState.module = {
      default: () => null,
      onGet: (ev: RequestEvent) => {
        throw ev.redirect(302, '/elsewhere');
      },
    };

    const { next, status } = await request(renderNothing);

    expect(status).toBe(302);
    expect(next).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('does not call next for an error page the router sent', async () => {
    routeState.module = {
      onGet: (ev: RequestEvent) => {
        throw ev.error(403, 'Members only');
      },
    };

    const { body, next, status } = await request(renderNothing);

    expect(status).toBe(403);
    expect(body).toContain('Members only');
    expect(next).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
