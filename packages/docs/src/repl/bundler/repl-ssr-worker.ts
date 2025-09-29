// SSR Worker - handles server-side rendering execution
// MUST be served from /repl/ so that its imports are intercepted by the REPL service worker
import type { QwikManifest } from '@qwik.dev/core/optimizer';
import type { RenderToString } from '@qwik.dev/core/server';
import type { ReplEvent } from '../types';

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

export interface SSRReadyMessage extends MessageBase {
  type: 'ready';
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
export type OutgoingMessage = SSRReadyMessage | SSRResultMessage | SSRErrorMessage;

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

// Workaround so vite doesn't try to process this import
const importFrom = (url: string) => {
  return import(/*@vite-ignore*/ url);
};

async function executeSSR(message: InitSSRMessage): Promise<{ html: string; events: any[] }> {
  const { baseUrl, manifest, entry } = message;
  const start = performance.now();

  // We prevent Vite from touching this import() and replace it after bundling
  const module = await importFrom(`/repl/ssr/${replId}/${entry}`);
  const server = module.default;

  const render: RenderToString = typeof server === 'function' ? server : server?.render;
  if (typeof render !== 'function') {
    throw new Error(`Server module ${entry} does not export default render function`);
  }

  const events: ReplEvent[] = [];
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
    preloader: false,
  });

  events.push({
    kind: 'console-log',
    scope: 'build',
    message: [`SSR: ${Math.round(performance.now() - start)}ms`],
    start,
    end: performance.now(),
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

self.postMessage({ type: 'ready' } as SSRReadyMessage);
