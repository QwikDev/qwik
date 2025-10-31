/** Maintains the state for a REPL instance */

import { isServer } from '@qwik.dev/core';
import { unwrapStore } from '@qwik.dev/core/internal';
import { getBundler } from './bundler';
import { registerReplSW } from './register-repl-sw';
import type { RequestMessage, ResponseMessage } from './repl-sw';
import type { ReplAppInput, ReplResult, ReplStore } from './types';
import { updateReplOutput } from './ui/repl-output-update';
import type {
  InitSSRMessage as RunSsrMessage,
  OutgoingMessage as SSROutgoingMessage,
} from './bundler/repl-ssr-worker';
import ssrWorkerUrl from './bundler/repl-ssr-worker?worker&url';
import listenerScript from './bundler/client-events-listener?compiled-string';

let channel: BroadcastChannel;
let registered = false;

export class ReplInstance {
  public replId: string;
  public dirtyBundle: boolean = true;
  public lastResult: ReplResult | null = null;

  constructor(
    public store: ReplStore,
    public input: ReplAppInput
  ) {
    this.replId = store.replId;
    if (isServer) {
      return;
    }
    if (!channel!) {
      channel = new BroadcastChannel('qwik-docs-repl');
    }
    channel.onmessage = (ev: MessageEvent<RequestMessage>) => {
      if (ev.data?.type === 'repl-request' && ev.data.replId === this.replId) {
        this.handleReplRequest(ev.data);
      }
    };
  }

  private buildPromise: Promise<void> | null = null;
  private bundlePromise: Promise<void> | null = null;
  async _ensureBundled() {
    if (this.dirtyBundle && this.input.version) {
      // Notice when input changed during build by changing before
      this.dirtyBundle = false;
      if (!registered) {
        await registerReplSW();
        registered = true;
      }

      this.lastResult = await this.rebuild().catch((e) => {
        return {
          html: `<html><h1>Build Error</h1><pre><code>${String(e).replaceAll('<', '&lt;')}</code></pre></html>`,
          clientBundles: [],
          ssrModules: [],
          diagnostics: [
            {
              scope: 'rollup-ssr',
              code: null,
              message: e.message,
              category: 'warning' as const,
              highlights: [],
              file: '',
              suggestions: null,
            },
          ],
          manifest: undefined,
          buildId: 0,
          transformedModules: [],
          events: [],
          isLoading: false,
        };
      });

      if (this.dirtyBundle) {
        setTimeout(() => this.ensureBuilt(), 50);
      }
    }
  }

  async _ensureSsr() {
    if (this.lastResult) {
      // We clear html when new SSR is needed
      if (!this.lastResult.html) {
        const ssrResult = await this.executeSSR(this.lastResult);
        if (this.lastResult) {
          this.lastResult.html = ssrResult.html;
          if (ssrResult.events) {
            this.lastResult.events.push(...ssrResult.events);
          }
        }
      }
      updateReplOutput(this.store, this.lastResult);
    }
  }

  ensureBuilt() {
    if (!this.buildPromise) {
      const showLoader = setTimeout(() => {
        this.store.isLoading = true;
      }, 400);
      this.bundlePromise = this._ensureBundled();
      this.buildPromise = this.bundlePromise
        .then(() => this._ensureSsr())
        .catch((e) => {
          console.error(e);
          this.lastResult!.html = errorHtml(e.message, 'Build');
          updateReplOutput(this.store, this.lastResult!);
        })
        .finally(() => {
          this.buildPromise = null;
          clearTimeout(showLoader);
          this.store.isLoading = false;
          console.log(
            this.lastResult!.events.filter((e) => e.scope === 'build')
              .map((e) => e.message)
              .join(' | ')
          );
        });
    }
    return this.buildPromise;
  }

  private async rebuild(): Promise<ReplResult> {
    // Get bundler for this Qwik version
    const bundler = getBundler(this.input.version);
    const result = await bundler.bundle({
      replId: this.replId,
      // You can't pass proxies to web workers
      srcInputs: this.input.files.map(unwrapStore),
      buildMode: this.input.buildMode,
      entryStrategy: { type: (this.input.entryStrategy as any) || 'component' },
      debug: this.input.debug,
    });

    updateReplOutput(this.store, result);

    return result;
  }

  handleReplRequest = async (msg: RequestMessage) => {
    const { requestId, url } = msg;
    let error: string | null = null;
    const fileContent = await this.getFile(url).catch((e) => {
      error = e.message;
      return null;
    });
    const status = fileContent === null ? 404 : error ? 500 : 200;
    const statusText =
      status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Internal Server Error';
    const headers: Record<string, string> = {
      'Cache-Control': 'no-store, no-cache, max-age=0',
      // Needed for SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    };
    if (status === 200) {
      headers['Content-Type'] = this.getContentType(url);
    }

    const message: ResponseMessage = {
      type: 'repl-response',
      requestId,
      response: {
        status,
        statusText,
        headers,
        body: fileContent || '',
      },
    };
    channel!.postMessage(message);
  };

  getContentType = (url: string): string => {
    const noQuery = url.split('?')[0];
    if (noQuery.endsWith('/')) {
      return 'text/html';
    }
    const ext = noQuery.split('.').pop()?.toLowerCase();
    if (ext) {
      switch (ext) {
        case 'js':
        case 'mjs':
        case 'cjs':
          return 'application/javascript';
        case 'json':
          return 'application/json';
        case 'css':
          return 'text/css';
        case 'html':
        case 'htm':
          return 'text/html';
        case 'svg':
          return 'image/svg+xml';
      }
    }
    return 'text/plain';
  };

  async getFile(path: string): Promise<string | null> {
    const match = path.match(/\/repl\/(client|ssr)\/([a-z0-9]+)\/(.*)/);
    if (!match) {
      throw new Error(`Invalid REPL path ${path}`);
    }
    const [, target, , filePath] = match;

    const ssrPromise = this.ensureBuilt();
    // First wait only for the bundles
    await this.bundlePromise?.catch(() => {});
    if (!this.lastResult) {
      return null;
    }

    // Serve SSR modules at /server/* path
    if (target === 'ssr') {
      // vite adds ?import to some imports, remove it for matching
      const serverPath = filePath.replace(/\?import$/, '');
      for (const module of this.lastResult.ssrModules) {
        if (serverPath === module.path) {
          return module.code;
        }
      }
      return null;
    }

    // Serve client bundles
    for (const bundle of this.lastResult.clientBundles) {
      if (filePath === bundle.path) {
        return bundle.code;
      }
    }

    if (filePath === 'index.html' || filePath === '') {
      // Here, also wait for SSR
      await ssrPromise.catch(() => {});
      if (this.lastResult.html) {
        // Inject the event listener script
        return this.lastResult.html + `<script>${listenerScript}</script>`;
      }
      return errorHtml('No HTML generated', 'REPL');
    }

    return null;
  }

  private _ssrWorkerP: Promise<Worker> | null = null;
  private _ssrKey: string | null = null;
  private _resultResolver: ((result: { html: string; events?: any[] }) => void) | null = null;

  // Get the long-running SSR worker for this build. We don't terminate so it's easy to debug, and later it might handle routes.
  private async getSsrWorker(result: ReplResult): Promise<Worker> {
    // TODO we should actually use a server manifest hash here, but this works for now
    const key = result.manifest?.manifestHash;
    if (!key) {
      throw new Error('No manifest found');
    }
    if (!this._ssrWorkerP || this._ssrKey !== key) {
      if (this._ssrWorkerP) {
        await this._ssrWorkerP.then((w) => w.terminate());
      }
      // Start from /repl so repl-sw can intercept the requests
      const ssrWorker = new Worker(`/repl${ssrWorkerUrl}`, { type: 'module' });
      let resolveWorker: (worker: Worker) => void;
      let rejectWorker: () => void;
      this._ssrWorkerP = new Promise((res, rej) => {
        resolveWorker = res;
        rejectWorker = rej;
      });
      this._ssrKey = key;

      ssrWorker.onmessage = (e: MessageEvent<SSROutgoingMessage>) => {
        const { type } = e.data;

        if (type === 'ready') {
          resolveWorker(ssrWorker);
        } else if (type === 'ssr-result') {
          this._resultResolver?.({
            html: e.data.html,
            events: e.data.events,
          });
        } else if (type === 'ssr-error') {
          this._resultResolver?.({
            html: errorHtml(e.data.error, 'SSR'),
          });
        } else {
          this._resultResolver?.({
            html: errorHtml(`Unknown SSR worker response: ${type}`, 'SSR'),
          });
        }
      };

      ssrWorker.onerror = () => {
        // Unfortunately onerror doesn't provide error details
        rejectWorker();
        ssrWorker.terminate();
        this._ssrWorkerP = null;
      };
    }
    return this._ssrWorkerP;
  }
  private async executeSSR(result: ReplResult): Promise<{ html: string; events?: any[] }> {
    const entryModule = result.ssrModules.find((m) => m.path.includes('entry.server'));
    if (!entryModule || typeof entryModule.code !== 'string') {
      return { html: errorHtml('No SSR entry module found', 'SSR') };
    }
    try {
      const ssrWorker = await this.getSsrWorker(result);
      const ssrMessage: RunSsrMessage = {
        type: 'run-ssr',
        replId: this.replId,
        entry: entryModule.path,
        baseUrl: `/repl/client/${this.replId}/build/`,
        manifest: result.manifest,
      };
      return new Promise((res) => {
        this._resultResolver = res;
        ssrWorker.postMessage(ssrMessage);
      });
    } catch (e) {
      return { html: errorHtml((e as Error).message, 'SSR') };
    }
  }

  markDirty(): void {
    this.dirtyBundle = true;
    setTimeout(() => this.ensureBuilt(), 50);
  }
}

function errorHtml(error: any, type: string) {
  return `<html><h1>${type} Error</h1><pre><code>${String(error).replaceAll('<', '&lt;')}</code></pre></html>`;
}
