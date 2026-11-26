import { describe, expect, it } from 'vitest';
import { _val } from '../shared/jsx/bind-handlers';
import { runQrl, taskQrl, valQrl } from '../shared/qrl/handler-qrls';
import { inlinedQrl } from '../shared/qrl/qrl';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import type { SerializationContext } from '../../serializer/serialization-context';
import type { QRL } from '../shared/qrl/qrl.public';
import { Task, TaskFlags } from '../use/use-task';
import { setEvent } from './ssr-events';

describe('setEvent', () => {
  const context = {
    $symbolToChunkResolver$: () => 'runtime',
    $addRoot$: () => 0,
    $eventQrls$: new Set(),
    $eventNames$: new Set(),
    $coreHandlerQrls$: new Map(),
    $pageLoadQrls$: new Map(),
  } as unknown as SerializationContext;

  it('does not wrap a capture-free sibling of moved captures', () => {
    const qrl = createQRL('chunk', 'handler', () => {});

    expect(setEvent(context, 'q-d:qinit', qrl, true)).toBe('chunk#handler');
  });

  it('lists the handler chunk after the core chunk that runs it', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();

    expect(setEvent(context, 'q-e:click', qrl, true)).toEqual([
      `runtime#${runQrl().$symbol$}`,
      '#',
      0,
      '#chunk',
    ]);
  });

  it('lists only the core chunk when the handler has no chunk file of its own', () => {
    const qrl = createQRL('_', 'handler', () => {}).m();

    expect(setEvent(context, 'q-e:click', qrl, true)).toEqual([
      `runtime#${runQrl().$symbol$}`,
      '#',
      0,
    ]);
  });

  const symbols = (qrls: Iterable<QRL<unknown>>) => [...qrls].map((q) => q.getSymbol());

  it('tells the preloader about _run and the handler it runs, in that order', () => {
    const qrl = createQRL('chunk', 'handler', () => {}).m();
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:click', qrl, true);

    expect(symbols(context.$eventQrls$)).toEqual([runQrl().$symbol$, 'handler']);
  });

  const visibleTask = (chunk = 'task-chunk') =>
    new Task(
      TaskFlags.VISIBLE_TASK,
      0,
      null!,
      createQRL(chunk, 'visibleTask', () => {}),
      null
    );

  it('tells the preloader about _task and the visible task it runs, in that order', () => {
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:qvisible', taskQrl().w([visibleTask()]), false);

    expect(symbols(context.$eventQrls$)).toEqual([taskQrl().$symbol$, 'visibleTask']);
  });

  it('tells the preloader about a visible task that runs when the document is ready', () => {
    context.$eventQrls$.clear();

    setEvent(context, 'q-d:qinit', taskQrl().w([visibleTask()]), false);

    expect(symbols(context.$eventQrls$)).toEqual([taskQrl().$symbol$, 'visibleTask']);
  });

  it('tells the preloader about a visible task that runs when the document is idle', () => {
    context.$eventQrls$.clear();

    setEvent(context, 'q-d:qidle', taskQrl().w([visibleTask()]), false);

    expect(symbols(context.$eventQrls$)).toEqual([taskQrl().$symbol$, 'visibleTask']);
  });

  it("names the visible task's chunk after core's in its attribute", () => {
    expect(setEvent(context, 'q-e:qvisible', taskQrl().w([visibleTask()]), false)).toEqual([
      `runtime#${taskQrl().$symbol$}`,
      '#',
      0,
      '#task-chunk',
    ]);
  });

  it('names no extra chunk when the visible task has no chunk file of its own', () => {
    expect(setEvent(context, 'q-e:qvisible', taskQrl().w([visibleTask('_')]), false)).toEqual([
      `runtime#${taskQrl().$symbol$}`,
      '#',
      0,
    ]);
  });

  it('names no extra chunk when what _task captures is not a task', () => {
    expect(setEvent(context, 'q-e:qvisible', taskQrl().w([{}]), false)).toEqual([
      `runtime#${taskQrl().$symbol$}`,
      '#',
      0,
    ]);
  });

  it('skips what _task captures when it is not a task', () => {
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:qvisible', taskQrl().w([{}]), false);

    expect(symbols(context.$eventQrls$)).toEqual([taskQrl().$symbol$]);
  });

  describe('handlers to modulepreload while the page streams', () => {
    const listedSymbols = () => [...context.$pageLoadQrls$.values()].map((q) => q.getSymbol());

    it('lists a handler of a document event named q*: document:onQInit$ adds its QRL to the list', () => {
      context.$pageLoadQrls$.clear();

      setEvent(
        context,
        'q-d:qinit',
        createQRL('chunk', 'startUp', () => {}),
        false
      );

      expect(listedSymbols()).toEqual(['startUp']);
    });

    it("lists the visible task itself, not only _task: a document-ready useVisibleTask$ adds the task's own QRL", () => {
      context.$pageLoadQrls$.clear();

      setEvent(context, 'q-d:qinit', taskQrl().w([visibleTask()]), false);

      expect(listedSymbols()).toEqual(['visibleTask']);
    });

    it('does not list a visible task that waits to be seen: useVisibleTask$ on q-e:qvisible adds nothing', () => {
      context.$pageLoadQrls$.clear();

      setEvent(context, 'q-e:qvisible', taskQrl().w([visibleTask()]), false);

      expect(listedSymbols()).toEqual([]);
    });

    it('does not list a handler that waits for the browser to be idle: document:onQIdle$ adds nothing', () => {
      context.$pageLoadQrls$.clear();

      setEvent(
        context,
        'q-d:qidle',
        createQRL('chunk', 'whenIdle', () => {}),
        false
      );

      expect(listedSymbols()).toEqual([]);
    });

    it("does not list a user event's handler: onClick$ adds nothing", () => {
      context.$pageLoadQrls$.clear();

      setEvent(
        context,
        'q-e:click',
        createQRL('chunk', 'handler', () => {}),
        false
      );

      expect(listedSymbols()).toEqual([]);
    });
  });

  describe("remembers each of core's handlers the page's events run through", () => {
    const freshContext = () =>
      ({
        $symbolToChunkResolver$: () => 'runtime',
        $addRoot$: () => 0,
        $eventQrls$: new Set(),
        $eventNames$: new Set(),
        $coreHandlerQrls$: new Map(),
        $pageLoadQrls$: new Map(),
      }) as unknown as SerializationContext;
    const rememberedHashes = (ctx: SerializationContext) => [...ctx.$coreHandlerQrls$.keys()];

    it('_run, for a handler with captures', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);

      expect(rememberedHashes(ctx)).toEqual([runQrl().getHash()]);
    });

    it("_task, when the page's only handler is a visible task", () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);

      expect(rememberedHashes(ctx)).toEqual([taskQrl().getHash()]);
    });

    it('none, for a handler without captures', () => {
      const ctx = freshContext();

      setEvent(
        ctx,
        'q-e:click',
        createQRL('chunk', 'handler', () => {}),
        true
      );

      expect(rememberedHashes(ctx)).toEqual([]);
    });

    it('each one once, in the order they appear', () => {
      const ctx = freshContext();

      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);
      setEvent(ctx, 'q-e:click', createQRL('chunk', 'handler', () => {}).m(), true);
      setEvent(ctx, 'q-e:qvisible', taskQrl().w([{}]), false);

      expect(rememberedHashes(ctx)).toEqual([taskQrl().getHash(), runQrl().getHash()]);
    });
  });

  it("preloads the optimizer's bind:value handler from core's own handler bundle", () => {
    const qrl = inlinedQrl(_val, '_val', [{}]) as QRLInternal<unknown>;
    context.$eventQrls$.clear();

    setEvent(context, 'q-e:input', qrl, false);

    expect(symbols(context.$eventQrls$)).toEqual([valQrl().$symbol$]);
  });

  it("serializes the optimizer's bind:value handler as core's own handler", () => {
    const qrl = inlinedQrl(_val, '_val', [{}]) as QRLInternal<unknown>;

    expect(setEvent(context, 'q-e:input', qrl, false)).toEqual([
      `runtime#${valQrl().$symbol$}`,
      '#',
      0,
    ]);
  });
});
