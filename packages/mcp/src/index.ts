import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Plugin, ViteDevServer, WebSocketClient } from 'vite';
import { transformComponentFile } from '../../devtools/plugin/src/transforms/component-transform';
import useCollectHooks from '../../devtools/plugin/src/virtualmodules/useCollectHooks';
import { createHookRuntime } from '../../devtools/plugin/src/runtime/create-hook-runtime';
import { createVNodeRuntime } from '../../devtools/plugin/src/runtime/create-vnode-runtime';
import { VIRTUAL_QWIK_DEVTOOLS_KEY } from '../../devtools/kit/src/protocol/hooks';
import { inspectInput, locateInput, type ToolName } from './protocol';
import { isLoopback } from './access';

const bridgeId = 'virtual:qwik-mcp';
const endpoint = '/__qwik_mcp';
/** Read-only inspection for local development, independent of the DevTools UI. */
export function qwikMcp(): Plugin {
  let server: ViteDevServer;
  const token = randomBytes(32).toString('hex');
  const pages = new Map<string, { url: string; client: WebSocketClient }>();
  const localSockets = new WeakSet<object>();
  const pending = new Map<
    string,
    {
      client: WebSocketClient;
      resolve: (result: Record<string, unknown>) => void;
      reject: (error: Error) => void;
    }
  >();
  let discoveryFile: string;
  let devUrl = '';
  let endpointUrl = '';
  const trackedClients = new WeakSet<WebSocketClient>();
  const version = (name: string) => {
    const require = createRequire(join(server.config.root, 'package.json'));
    try {
      return require(`${name}/package.json`).version as string;
    } catch {
      throw new Error(`Cannot resolve ${name} in ${server.config.root}.`);
    }
  };
  const router = () =>
    server.config.plugins.find((plugin) => plugin.name === 'vite-plugin-qwik-router')?.api as
      | {
          getRoutes(): {
            pathname: string;
            filePath: string;
            paramNames: string[];
            layouts: { filePath: string }[];
          }[];
        }
      | undefined;
  const pageToolInputs = {
    get_dev_errors: inspectInput,
    inspect_page: inspectInput,
    locate_element: locateInput,
  };
  const call = async (name: ToolName, args: Record<string, unknown>) => {
    if (name === 'get_project_info') {
      return {
        root: server.config.root,
        qwikVersion: version('@qwik.dev/core'),
        ...(router() ? { routerVersion: version('@qwik.dev/router') } : {}),
        devUrl,
      };
    }
    if (name === 'list_routes') {
      return {
        routerInstalled: !!router(),
        routes:
          router()
            ?.getRoutes()
            .map((route) => ({
              pathname: route.pathname,
              file: relative(server.config.root, route.filePath),
              params: route.paramNames,
              layouts: route.layouts.map((layout) => relative(server.config.root, layout.filePath)),
            })) ?? [],
      };
    }
    if (!Object.hasOwn(pageToolInputs, name)) {
      throw new Error('Unknown MCP tool.');
    }
    args = pageToolInputs[name as keyof typeof pageToolInputs].parse(args);
    const matches = [...pages.values()].filter((page) => !args.url || page.url === args.url);
    if (!matches.length) {
      throw new Error('No connected page. Open the requested Qwik URL in a local browser.');
    }
    if (matches.length !== 1) {
      throw new Error(
        `Multiple pages are connected. Supply a unique url or close duplicate tabs: ${matches.map((page) => page.url).join(', ')}`
      );
    }
    const client = matches[0].client;
    const id = randomUUID();
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Page did not respond. Reload the page and retry.'));
      }, 5000);
      pending.set(id, {
        client,
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      client.send({ type: 'custom', event: 'qwik:mcp:request', data: { id, name, args } });
    });
  };
  return {
    name: 'qwik-mcp',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id) {
      const normalized = id
        .replace(/^\/?@id\//, '')
        .replace(/^\//, '')
        .split('?')[0];
      if (normalized === bridgeId || normalized === VIRTUAL_QWIK_DEVTOOLS_KEY) {
        return `/${normalized}`;
      }
    },
    async load(id) {
      if (id === `/${VIRTUAL_QWIK_DEVTOOLS_KEY}`) {
        return useCollectHooks;
      }
      if (id === `/${bridgeId}`) {
        return (
          createHookRuntime() +
          createVNodeRuntime() +
          (await readFile(new URL('../dist/browser.js', import.meta.url), 'utf8'))
        );
      }
    },
    // Runs before the optimizer, which has no input sourcemap: never add or remove source lines.
    transform(code, id) {
      if (
        /\.[jt]sx(?:\?|$)/.test(id) &&
        !id.includes('/node_modules/') &&
        code.includes('component$')
      ) {
        return { code: transformComponentFile(code, id), map: null };
      }
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: `${server.config.base}@id/${bridgeId}` },
          injectTo: 'head',
        },
      ];
    },
    configureServer(vite) {
      server = vite;
      if (!server.httpServer || server.config.server.https || server.config.server.hmr === false) {
        throw new Error('qwikMcp requires a standalone HTTP Vite server with HMR enabled.');
      }
      const directory = join(server.config.root, 'node_modules/.cache/qwik-mcp');
      discoveryFile = join(directory, `${process.pid}-${randomUUID()}.json`);
      server.httpServer.once('listening', async () => {
        const address = server.httpServer!.address();
        if (!address || typeof address === 'string') {
          return;
        }
        const host = address.address === '::1' ? '[::1]' : '127.0.0.1';
        endpointUrl = `http://${host}:${address.port}${endpoint}`;
        devUrl = `http://${host}:${address.port}${server.config.base}`;
        try {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await writeFile(discoveryFile, JSON.stringify({ url: endpointUrl, token }), {
            mode: 0o600,
            flag: 'wx',
          });
        } catch (error) {
          server.config.logger.error(`Cannot write Qwik MCP discovery file: ${error}`);
        }
      });
      server.httpServer.once('close', () => {
        void unlink(discoveryFile).catch(() => {});
      });
      server.ws.on('connection', (socket, request) => {
        if (isLoopback(request.socket.remoteAddress)) {
          localSockets.add(socket);
        }
      });
      server.ws.on('qwik:mcp:page', (page: { pageId: string; url: string }, client) => {
        if (
          !localSockets.has(client.socket) ||
          typeof page?.pageId !== 'string' ||
          typeof page.url !== 'string'
        ) {
          return;
        }
        try {
          if (!['http:', 'https:'].includes(new URL(page.url).protocol)) {
            return;
          }
        } catch {
          return;
        }
        if (pages.has(page.pageId) && pages.get(page.pageId)!.client !== client) {
          return;
        }
        pages.set(page.pageId, { url: page.url, client });
        if (trackedClients.has(client)) {
          return;
        }
        trackedClients.add(client);
        client.socket.once('close', () => {
          for (const [id, page] of pages) {
            if (page.client === client) {
              pages.delete(id);
            }
          }
          for (const [id, request] of pending) {
            if (request.client === client) {
              pending.delete(id);
              request.reject(new Error('Page disconnected.'));
            }
          }
        });
      });
      server.ws.on('qwik:mcp:leave', (page: { pageId?: string }, client) => {
        if (page?.pageId && pages.get(page.pageId)?.client === client) {
          pages.delete(page.pageId);
        }
      });
      server.ws.on(
        'qwik:mcp:response',
        (response: { id: string; result: Record<string, unknown>; error?: string }, client) => {
          const request = pending.get(response?.id);
          if (!request || request.client !== client) {
            return;
          }
          pending.delete(response.id);
          if (response.error) {
            request.reject(new Error(response.error));
          } else {
            request.resolve(response.result);
          }
        }
      );
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== endpoint) {
          next();
          return;
        }
        if (
          !isLoopback(req.socket.remoteAddress) ||
          req.headers.authorization !== `Bearer ${token}` ||
          req.headers.origin ||
          req.headers.host !== new URL(endpointUrl).host
        ) {
          res.writeHead(403).end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405).end();
          return;
        }
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-store');
        try {
          let body = Buffer.alloc(0);
          for await (const chunk of req) {
            body = Buffer.concat([body, chunk]);
            if (body.length > 8192) {
              throw new Error('MCP request is too large.');
            }
          }
          const { name, args } = JSON.parse(body.toString('utf8'));
          const result = await call(name, args ?? {});
          res.end(JSON.stringify({ result }));
        } catch (error) {
          res.end(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
          );
        }
      });
    },
  };
}
