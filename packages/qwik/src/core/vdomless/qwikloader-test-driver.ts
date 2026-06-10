import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
      target.dispatchEvent(createTestEvent(target.ownerDocument, type, init));
      await flushQwikLoaderTasks();
    },
    cleanup() {},
  };
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
  const testSource = source.replace(/\bimport\s*\(/g, '__import(');
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
    (href: string) => import(/* @vite-ignore */ href)
  );
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

async function flushQwikLoaderTasks(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
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
