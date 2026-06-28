import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { QRL_RUNTIME_CHUNK } from '../shared/serdes/qrl-to-string';

export type QwikLoaderEventPayload = EventInit & Record<string, unknown>;

export interface QwikLoaderTestDriver {
  dispatch(target: Element, type: string, payload?: QwikLoaderEventPayload): Promise<void>;
  cleanup(): void;
}

export async function bootQwikLoader(document: Document): Promise<QwikLoaderTestDriver> {
  const win = document.defaultView as Window | null;
  if (win === null) {
    throw new Error('Missing document.defaultView.');
  }

  ensureDocumentReady(document);
  executeQwikEventScripts(document, win);
  runQwikLoader(await getQwikLoaderSource(document), document, win);

  return {
    async dispatch(target, type, init = {}) {
      ensureConnectedTarget(target);
      const errors: unknown[] = [];
      const onError = (event: Event) => {
        errors.push((event as CustomEvent).detail);
      };
      document.addEventListener('qerror', onError);
      try {
        target.dispatchEvent(createTestEvent(target.ownerDocument, type, init));
        await flushQwikLoaderTasks(win);
      } finally {
        document.removeEventListener('qerror', onError);
      }
      if (errors.length > 0) {
        throw new Error(formatQwikLoaderError(errors[0]));
      }
    },
    cleanup() {},
  };
}

function formatQwikLoaderError(detail: unknown): string {
  if (detail && typeof detail === 'object') {
    const record = detail as Record<string, unknown>;
    const error = record.error;
    const importError = record.importError;
    const message =
      error instanceof Error
        ? error.message
        : importError instanceof Error
          ? importError.message
          : typeof error === 'string'
            ? error
            : typeof importError === 'string'
              ? importError
              : undefined;
    const symbol = typeof record.symbol === 'string' ? ` symbol=${record.symbol}` : '';
    const qbase = typeof record.qBase === 'string' ? ` qBase=${record.qBase}` : '';
    return `Qwikloader error:${symbol}${qbase}${message ? ` ${message}` : ''}`;
  }
  return `Qwikloader error: ${String(detail)}`;
}

function ensureDocumentReady(document: Document): void {
  if (document.readyState !== 'complete') {
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete',
    });
  }
}

function ensureConnectedTarget(target: Element): void {
  if (!target.isConnected) {
    Object.defineProperty(target, 'isConnected', {
      configurable: true,
      value: true,
    });
  }
}

function executeQwikEventScripts(document: Document, win: Window): void {
  const scripts = Array.from(document.querySelectorAll('script'));
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const text = script.textContent ?? '';
    if (script.id === 'qwikloader' || script.getAttribute('type') === 'qwik/state') {
      continue;
    }
    if (text.includes('window._qwikEv')) {
      // eslint-disable-next-line no-new-func
      new Function('window', text)(win);
    }
  }
}

async function getQwikLoaderSource(document: Document): Promise<string> {
  const inlineLoader = document.querySelector('script#qwikloader')?.textContent?.trim();
  if (inlineLoader) {
    return inlineLoader;
  }
  return readFile(join(findRepoRoot(), 'packages/qwik/dist/qwikloader.debug.js'), 'utf8');
}

function runQwikLoader(source: string, document: Document, win: Window): void {
  const testWindow = win as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  testWindow.requestIdleCallback ??= (callback: IdleRequestCallback) =>
    setTimeout(
      () =>
        callback({
          didTimeout: false,
          timeRemaining: () => 0,
        }),
      0
    ) as unknown as number;
  testWindow.cancelIdleCallback ??= (handle: number) => clearTimeout(handle);

  const testSource = source
    .replace(
      'const queueTasks = (tasks) => {',
      'const queueTasks = (tasks) => { window.__qwikTestGetQueuedTasks = () => queuedTasks;'
    )
    .replace(
      'queuedTasks = queuedTasks ? queuedTasks.then(run, run) : run();',
      'queuedTasks = queuedTasks ? queuedTasks.then(run, run) : run(); window.__qwikTestQueuedTasks = queuedTasks;'
    )
    .replace(/\bimport\s*\(/g, '__import(');
  const DominoCustomEvent = function <T = unknown>(type: string, init?: CustomEventInit<T>) {
    // Qwikloader emits qsymbol/qerror via document.dispatchEvent(new CustomEvent(...)).
    // The mock window CustomEvent is a plain object, so create a domino Event with detail.
    return createTestEvent(document, type, {
      bubbles: false,
      cancelable: false,
      detail: init?.detail,
    });
  } as unknown as typeof CustomEvent;
  // eslint-disable-next-line no-new-func
  new Function(
    'window',
    'document',
    'CustomEvent',
    'IntersectionObserver',
    'performance',
    '__import',
    testSource
  )(
    win,
    document,
    DominoCustomEvent,
    createIntersectionObserverStub(),
    { now: () => 1 },
    (href: string) => importQwikLoaderModule(href)
  );
}

function importQwikLoaderModule(href: string): Promise<Record<string, unknown>> {
  if (href.endsWith(`/${QRL_RUNTIME_CHUNK}`) || href === QRL_RUNTIME_CHUNK) {
    return import('@qwik.dev/core/spark');
  }
  return import(/* @vite-ignore */ href);
}

function createIntersectionObserverStub(): typeof IntersectionObserver {
  return class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof IntersectionObserver;
}

function createTestEvent(
  document: Document,
  type: string,
  init: EventInit & { detail?: unknown }
): Event {
  const { bubbles = true, cancelable = true, ...rest } = init as QwikLoaderEventPayload;
  const eventCtor = Object.getPrototypeOf(document.createEvent('Event')).constructor as {
    new (type: string, dictionary?: Record<string, unknown>): Event;
  };
  const event = new eventCtor(type, {
    bubbles,
    cancelable,
  });
  Object.assign(event, rest);
  return event;
}

async function flushQwikLoaderTasks(win: Window): Promise<void> {
  const testWindow = win as Window & {
    __qwikTestGetQueuedTasks?: () => Promise<void> | undefined;
    __qwikTestQueuedTasks?: Promise<void>;
  };
  let previous: Promise<void> | undefined;
  for (let i = 0; i < 20; i++) {
    const pending = testWindow.__qwikTestGetQueuedTasks?.() ?? testWindow.__qwikTestQueuedTasks;
    if (pending && pending !== previous) {
      previous = pending;
      await pending;
      continue;
    }
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (testWindow.__qwikTestQueuedTasks === pending) {
      return;
    }
  }
}

function findRepoRoot() {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('Unable to locate repository root.');
    }
    dir = parent;
  }
  return dir;
}
