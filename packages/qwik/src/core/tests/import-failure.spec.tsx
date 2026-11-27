import {
  $,
  Catch,
  component$,
  componentQrl,
  render,
  setPlatform,
  useComputedQrl,
  useConstant,
  useSignal,
  useTask$,
  useTaskQrl,
  useVisibleTaskQrl,
  type Component,
  type JSXOutput,
  type QRL,
} from '@qwik.dev/core';
import { _getDomContainer } from '@qwik.dev/core/internal';
import {
  createDocument,
  getTestPlatform,
  ssrRenderToDom,
  trigger,
  waitForDrain,
} from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { AsyncSignalFlags, ComputedSignalFlags } from '../reactive-primitives/types';
import { qrl } from '../shared/qrl/qrl';
import type { Container } from '../shared/types';
import * as logUtils from '../shared/utils/log';
import { delay } from '../shared/utils/promises';

const fallback = () => $((error: any) => <p id="fallback">caught: {String(error?.message)}</p>);

const failedChunkMessage = (symbol: string) =>
  `Failed to fetch dynamically imported module: /${symbol}.js`;

const chunkFailingFirst = <T,>(failureCount: number, symbol: string, value: T) => {
  let loadCount = 0;
  const load = () => {
    loadCount++;
    return loadCount <= failureCount
      ? Promise.reject(new TypeError(failedChunkMessage(symbol)))
      : Promise.resolve({ [symbol]: value });
  };
  return { qrl: qrl(load, symbol) as any, loadCount: () => loadCount };
};

const failingChunk = <T,>(symbol: string, value: T) => chunkFailingFirst(Infinity, symbol, value);

const chunkThrowing = (symbol: string, error: Error) =>
  qrl(() => Promise.reject(error), symbol) as any;

const shownOnClick = (Child: Component) =>
  component$(() => {
    const isShown = useSignal(false);
    return (
      <div id="wrap">
        <button id="show" onClick$={() => (isShown.value = true)}>
          show
        </button>
        <span id="content">ok</span>
        {isShown.value && <Child />}
      </div>
    );
  });

const resumedAsyncComputed = (computeQrl: QRL<any>, container: Container | null = null) =>
  new ComputedSignalImpl<number>(
    container,
    computeQrl as any,
    ComputedSignalFlags.INVALID | AsyncSignalFlags.ASYNC_MODE
  );

let qErrors: any[] = [];
let unhandledRejections: unknown[] = [];
const recordUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
let stopListening = () => {};
let consoleError: ReturnType<typeof vi.spyOn>;
let uncaughtError: ReturnType<typeof vi.spyOn>;

const settle = async (container: Container) => {
  await waitForDrain(container).catch(() => {});
  await delay(0);
  await waitForDrain(container).catch(() => {});
  await delay(0);
};

const renderAndListen = async (jsx: JSXOutput) => {
  setPlatform(getTestPlatform());
  const document = createDocument();
  const recordQError = (event: Event) => qErrors.push((event as CustomEvent).detail);
  document.addEventListener('qerror', recordQError);
  const nodeCustomEvent = globalThis.CustomEvent;
  vi.stubGlobal('CustomEvent', document.createEvent('CustomEvent').constructor);
  stopListening = () => {
    document.removeEventListener('qerror', recordQError);
    vi.stubGlobal('CustomEvent', nodeCustomEvent);
  };
  await render(document.body, jsx);
  const container = _getDomContainer(document.body);
  await settle(container);
  return { container, root: container.element };
};

const reportedFailures = () =>
  qErrors.map((detail) => ({
    importError: detail.importError,
    symbol: detail.symbol,
    element: detail.element?.id || detail.element?.tagName,
  }));

beforeEach(() => {
  qErrors = [];
  unhandledRejections = [];
  process.on('unhandledRejection', recordUnhandledRejection);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  uncaughtError = vi.spyOn(logUtils, 'logErrorAndThrowAsync');
});

afterEach(async () => {
  await delay(0);
  stopListening();
  process.off('unhandledRejection', recordUnhandledRejection);
  consoleError.mockRestore();
  uncaughtError.mockRestore();
});

describe('a chunk that fails to download', () => {
  it("a task's chunk: fires one qerror and keeps the content inside a Catch", async () => {
    const taskQrl = failingChunk('s_task', () => {}).qrl;
    const Cart = component$(() => {
      useTaskQrl(taskQrl);
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <div id="wrap">
          <Cart />
        </div>
      </Catch>
    );

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(root.querySelector('#content')).toBeTruthy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_task', element: 'wrap' },
    ]);
    expect(qErrors[0].error.message).toBe(failedChunkMessage('s_task'));
  });

  it("a visible task's chunk: fires one qerror and keeps the content", async () => {
    const taskQrl = failingChunk('s_visibleTask', () => {}).qrl;
    const Cart = component$(() => {
      useVisibleTaskQrl(taskQrl, { strategy: 'document-ready' });
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <div id="wrap">
          <Cart />
        </div>
      </Catch>
    );

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(root.querySelector('#content')).toBeTruthy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_visibleTask', element: 'wrap' },
    ]);
    expect(unhandledRejections).toEqual([]);
  });

  it("a component's render chunk: fires one qerror and shows no fallback", async () => {
    const Modal = componentQrl(failingChunk('s_modal', () => <span id="modal">modal</span>).qrl);
    const Page = shownOnClick(Modal);
    const { container, root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Page />
      </Catch>
    );
    await trigger(root, '#show', 'click');
    await settle(container);

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(root.querySelector('#content')).toBeTruthy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_modal', element: 'wrap' },
    ]);
  });

  it('a computed read while rendering: the qerror names the computed', async () => {
    const computedQrl = failingChunk('s_computed', () => 'value').qrl;
    const Reader = component$(() => {
      const computed = useComputedQrl<string>(computedQrl);
      return computed.value ? <b id="reader">ready</b> : <i id="reader">empty</i>;
    });
    const Page = shownOnClick(Reader);
    const { container, root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Page />
      </Catch>
    );
    await trigger(root, '#show', 'click');
    await settle(container);

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_computed', element: 'wrap' },
    ]);
    expect(unhandledRejections).toEqual([]);
  });

  it('a computed read in a JSX binding: fires the qerror on the element holding the binding', async () => {
    const computedQrl = failingChunk('s_boundComputed', () => 'value').qrl;
    const Reader = component$(() => {
      const computed = useComputedQrl<string>(computedQrl);
      return <b id="reader">{computed.value}</b>;
    });
    const Page = shownOnClick(Reader);
    const { container, root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Page />
      </Catch>
    );
    await trigger(root, '#show', 'click');
    await settle(container);

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_boundComputed', element: 'reader' },
    ]);
  });

  it('a handler reading a computed whose chunk failed: the qerror names the computed, not the handler', async () => {
    const computedQrl = failingChunk('s_handlerComputed', () => 'value').qrl;
    const Reader = component$(() => {
      const computed = useComputedQrl<string>(computedQrl);
      return (
        <button id="read" onClick$={() => computed.value}>
          read
        </button>
      );
    });
    const { container, root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Reader />
      </Catch>
    );
    await trigger(root, '#read', 'click');
    await settle(container);

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_handlerComputed', element: 'read' },
    ]);
  });

  it('a computed with no reader: fires a qerror on the container element, with no uncaught error', async () => {
    const computedQrl = failingChunk('s_unreadComputed', () => 'value').qrl;
    const Owner = component$(() => {
      const computed = useComputedQrl<string>(computedQrl);
      return (
        <button id="invalidate" onClick$={() => computed.invalidate()}>
          invalidate
        </button>
      );
    });
    const { container, root } = await renderAndListen(<Owner />);
    await trigger(root, '#invalidate', 'click');
    await settle(container);

    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_unreadComputed', element: root.tagName },
    ]);
    expect(uncaughtError).not.toHaveBeenCalled();
  });

  it('two tasks waiting on one chunk each fire a qerror', async () => {
    const taskQrl = failingChunk('s_sharedTask', () => {}).qrl;
    const Cart = component$(() => {
      useTaskQrl(taskQrl);
      useTaskQrl(taskQrl);
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <div id="wrap">
          <Cart />
        </div>
      </Catch>
    );

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_sharedTask', element: 'wrap' },
      { importError: 'async', symbol: 's_sharedTask', element: 'wrap' },
    ]);
  });

  it('a task that throws its own error still reaches the Catch', async () => {
    const Cart = component$(() => {
      useTask$(() => {
        throw new Error('task boom');
      });
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Cart />
      </Catch>
    );

    expect(root.querySelector('#fallback')?.textContent).toBe('caught: task boom');
    expect(qErrors).toEqual([]);
  });

  it('a preload nobody awaits leaves no unhandled rejection', async () => {
    const computedQrl = failingChunk('s_preloadedComputed', () => 'value').qrl;
    const Owner = component$(() => {
      useComputedQrl<string>(computedQrl);
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(<Owner />);

    expect(root.querySelector('#content')).toBeTruthy();
    expect(unhandledRejections).toEqual([]);
    expect(qErrors).toEqual([]);
  });

  it('while rendering on the server: the render fails, with no qerror', async () => {
    const taskQrl = failingChunk('s_serverTask', () => {}).qrl;
    const Cart = component$(() => {
      useTaskQrl(taskQrl);
      return <span id="content">ok</span>;
    });

    await expect(ssrRenderToDom(<Cart />)).rejects.toThrow(failedChunkMessage('s_serverTask'));
    expect(qErrors).toEqual([]);
  });
});

describe('a chunk whose top-level code throws', () => {
  it("an Error from a task's chunk reaches the Catch", async () => {
    const taskQrl = chunkThrowing('s_throwingTask', new Error('chunk boom'));
    const Cart = component$(() => {
      useTaskQrl(taskQrl);
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Cart />
      </Catch>
    );

    expect(root.querySelector('#fallback')?.textContent).toBe('caught: chunk boom');
    expect(qErrors).toEqual([]);
  });

  it("an Error from a component's render chunk reaches the Catch", async () => {
    const Modal = componentQrl(chunkThrowing('s_throwingModal', new Error('chunk boom')));
    const Page = shownOnClick(Modal);
    const { container, root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Page />
      </Catch>
    );
    await trigger(root, '#show', 'click');
    await settle(container);

    expect(root.querySelector('#fallback')?.textContent).toBe('caught: chunk boom');
    expect(qErrors).toEqual([]);
  });

  it('a TypeError is still reported as a failed download', async () => {
    const taskQrl = chunkThrowing(
      's_typeErrorTask',
      new TypeError("Cannot read properties of undefined (reading 'length')")
    );
    const Cart = component$(() => {
      useTaskQrl(taskQrl);
      return <span id="content">ok</span>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <div id="wrap">
          <Cart />
        </div>
      </Catch>
    );

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_typeErrorTask', element: 'wrap' },
    ]);
  });
});

describe('an async computed whose chunk fails to download', () => {
  it('stops pending and sets no error', async () => {
    const { container } = await renderAndListen(<div />);
    const asyncComputed = resumedAsyncComputed(
      failingChunk('s_asyncComputed', async () => 42).qrl,
      container
    );

    expect(asyncComputed.untrackedPending).toBe(true);
    await settle(container);

    expect(asyncComputed.untrackedPending).toBe(false);
    expect(asyncComputed.untrackedError).toBeUndefined();
    expect(unhandledRejections).toEqual([]);
  });

  it('fires one qerror, also when a component reads its value', async () => {
    const chunk = failingChunk('s_readAsyncComputed', async () => 42);
    const computeQrl = chunk.qrl;
    const Reader = component$(() => {
      const asyncComputed = useConstant(() => resumedAsyncComputed(computeQrl));
      return asyncComputed.value ? <b id="reader">ready</b> : <i id="reader">empty</i>;
    });
    const { root } = await renderAndListen(
      <Catch fallback$={fallback()}>
        <Reader />
      </Catch>
    );

    expect(root.querySelector('#fallback')).toBeFalsy();
    expect(reportedFailures()).toEqual([
      { importError: 'async', symbol: 's_readAsyncComputed', element: root.tagName },
    ]);
    expect(chunk.loadCount()).toBe(1);
  });

  it('loads again when invalidated', async () => {
    const { container } = await renderAndListen(<div />);
    const chunk = chunkFailingFirst(1, 's_recoveredAsyncComputed', async () => 42);
    const asyncComputed = resumedAsyncComputed(chunk.qrl, container);
    expect(asyncComputed.untrackedPending).toBe(true);
    await settle(container);

    asyncComputed.invalidate();
    await asyncComputed.promise();

    expect(asyncComputed.untrackedValue).toBe(42);
    expect(chunk.loadCount()).toBe(2);
  });
});
