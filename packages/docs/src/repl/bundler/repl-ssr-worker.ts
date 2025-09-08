// SSR Worker - handles server-side rendering execution
// MUST be served from /repl/ so that its imports are intercepted by the REPL service worker
import type { QwikManifest } from '@builder.io/qwik/optimizer';

// Worker message types
interface MessageBase {
  type: string;
}

export interface InitSSRMessage extends MessageBase {
  type: 'run-ssr';
  replId: string;
  entry: string;
  baseUrl: string;
  manifest: QwikManifest | undefined;
}

export interface SSRResultMessage extends MessageBase {
  type: 'ssr-result';
  html: string;
  events: any[];
}

export interface SSRErrorMessage extends MessageBase {
  type: 'ssr-error';
  error: string;
  stack?: string;
}

type IncomingMessage = InitSSRMessage;
export type OutgoingMessage = SSRResultMessage | SSRErrorMessage;

let replId: string;

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'run-ssr':
      replId = e.data.replId;
      try {
        const result = await executeSSR(e.data);
        const message: SSRResultMessage = {
          type: 'ssr-result',
          html: result.html,
          events: result.events,
        };
        self.postMessage(message);
      } catch (error) {
        console.error(`SSR worker for %s failed`, replId, error);
        const message: SSRErrorMessage = {
          type: 'ssr-error',
          error: (error as Error)?.message || String(error),
          stack: (error as Error)?.stack,
        };
        self.postMessage(message);
      }
      break;

    default:
      console.warn('Unknown SSR worker message type:', type);
  }
};

async function executeSSR(message: InitSSRMessage): Promise<{ html: string; events: any[] }> {
  const { baseUrl, manifest, entry } = message;

  // @ts-expect-error - we prevent Vite from touching this import and replace it later
  const module = await DO_NOT_TOUCH_IMPORT(`/repl/${replId}-ssr/${entry}`);
  const server = module.default;

  const render = typeof server === 'function' ? server : server?.render;
  if (typeof render !== 'function') {
    throw new Error(`Server module ${entry} does not export default render function`);
  }

  const events: any[] = [];
  const orig: Record<string, any> = {};

  const wrapConsole = (kind: 'log' | 'warn' | 'error' | 'debug') => {
    orig[kind] = console[kind];
    console[kind] = (...args: any[]) => {
      events.push({
        kind: `console-${kind}` as any,
        scope: 'ssr',
        message: args.map((a) => String(a)),
        start: performance.now(),
      });
      orig[kind](...args);
    };
  };
  wrapConsole('log');
  wrapConsole('warn');
  wrapConsole('error');
  wrapConsole('debug');

  const ssrResult = await render({
    base: baseUrl,
    manifest,
    prefetchStrategy: null,
  }).catch((e: any) => {
    console.error('SSR failed', e);
    return {
      html: `<html><h1>SSR Error</h1><pre><code>${String(e).replaceAll('<', '&lt;')}</code></pre></html>`,
    };
  });

  // Restore console methods
  console.log = orig.log;
  console.warn = orig.warn;
  console.error = orig.error;
  console.debug = orig.debug;

  return {
    html: ssrResult.html,
    events,
  };
}
