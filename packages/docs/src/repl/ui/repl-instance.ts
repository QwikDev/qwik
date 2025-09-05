/** Maintains the state for a REPL instance */

import { isServer, unwrapStore } from '@builder.io/qwik';
import { getBundler } from '../bundler';
import { registerReplSW } from '../register-repl-sw';
import type { RequestMessage, ResponseMessage } from '../repl-sw';
import type { ReplAppInput, ReplResult, ReplStore } from '../types';
import { updateReplOutput } from './repl-output-update';

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

  async ensureBuilt() {
    if (this.dirtyBundle && this.input.version) {
      // Notice when input changed during build by changing before
      this.dirtyBundle = false;
      const showLoader = setTimeout(() => {
        this.store.isLoading = true;
      }, 400);
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
      clearTimeout(showLoader);

      this.store.isLoading = false;
      this.store.reload++;

      if (this.dirtyBundle) {
        setTimeout(() => this.ensureBuilt(), 50);
      }
    }
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
    const headers: Record<string, string> =
      status === 200
        ? {
            'Content-Type': this.getContentType(url),
            'Cache-Control': 'no-store, no-cache, max-age=0',
          }
        : {};

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
    if (url.endsWith('.js')) {
      return 'application/javascript';
    }
    if (url.endsWith('.css')) {
      return 'text/css';
    }
    if (url.endsWith('.json')) {
      return 'application/json';
    }
    if (url.endsWith('.html') || url.endsWith('/')) {
      return 'text/html';
    }
    return 'text/plain';
  };

  async getFile(path: string): Promise<string | null> {
    await this.ensureBuilt();

    if (!this.lastResult) {
      return null;
    }

    // Remove the /repl/[id] prefix
    const cleanPath = path.replace(/^\/repl\/[^/]+\//, '/');
    if (cleanPath === '/index.html' || cleanPath === '/') {
      return this.lastResult.html || '<html><body>No HTML generated</body></html>';
    }

    for (const bundle of this.lastResult.clientBundles) {
      if (cleanPath === `/${bundle.path}`) {
        return bundle.code;
      }
    }

    return null;
  }

  markDirty(): void {
    this.dirtyBundle = true;
    setTimeout(() => this.ensureBuilt(), 50);
  }
}
