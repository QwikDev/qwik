import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * Loads a fresh instance of the core modules, as happens when an app and an externalized library
 * each bundle their own copy of `@qwik.dev/core`. Every call returns a distinct module instance.
 */
const loadCoreCopy = async () => {
  vi.resetModules();
  // Evaluate the public entry first so the internal module graph loads in its normal order.
  await import('../index');
  const useCore = await import('../use/use-core');
  const platform = await import('./platform/platform');
  const signalApi = await import('../reactive-primitives/signal-api');
  const signalUtils = await import('../reactive-primitives/utils');
  const signalImpl = await import('../reactive-primitives/impl/signal-impl');
  const computedSignalImpl = await import('../reactive-primitives/impl/computed-signal-impl');
  const wrappedSignalImpl = await import('../reactive-primitives/impl/wrapped-signal-impl');
  const useTask = await import('../use/use-task');
  const jsxNode = await import('./jsx/jsx-node');
  const constants = await import('./utils/constants');
  const verify = await import('./serdes/verify');
  const reactiveTypes = await import('../reactive-primitives/types');
  const qrl = await import('./qrl/qrl');
  const qrlClass = await import('./qrl/qrl-class');
  const qrlPublic = await import('./qrl/qrl.public');
  const singletons = await import('./singletons');
  const slot = await import('./jsx/slot.public');
  const jsxRuntime = await import('./jsx/jsx-runtime');
  const jsxUtils = await import('./jsx/utils.public');
  const cursorQueue = await import('./cursor/cursor-queue');
  const cursorProps = await import('./cursor/cursor-props');
  const suspenseUtils = await import('../control-flow/suspense-utils');
  return {
    ...useCore,
    ...platform,
    ...signalApi,
    ...signalUtils,
    ...signalImpl,
    ...computedSignalImpl,
    ...wrappedSignalImpl,
    ...useTask,
    ...jsxNode,
    ...constants,
    ...verify,
    ...reactiveTypes,
    ...qrl,
    ...qrlClass,
    ...qrlPublic,
    ...singletons,
    ...slot,
    ...jsxRuntime,
    ...jsxUtils,
    ...cursorQueue,
    ...cursorProps,
    ...suspenseUtils,
    // Module namespaces keep live bindings; a spread copies their value at spread time.
    qrlClassModule: qrlClass,
  };
};

describe('duplicate core copies share runtime state', async () => {
  const first = await loadCoreCopy();
  const second = await loadCoreCopy();

  afterEach(() => {
    first.setPlatform(first.createPlatform());
  });

  test('module instances are distinct', () => {
    expect(first.SignalImpl).not.toBe(second.SignalImpl);
  });

  test('the invoke context is visible from the other copy', () => {
    const context = { $locale$: 'nl' } as any;
    const seen = first.invoke(context, () => second.tryGetInvokeContext());
    expect(seen).toBe(context);
    expect(second.tryGetInvokeContext()).toBeUndefined();
  });

  test('the platform stays per copy, since each app render installs its own manifest', () => {
    const customPlatform = { ...first.createPlatform(), isServer: true };
    first.setPlatform(customPlatform);
    expect(second.getPlatform()).not.toBe(customPlatform);
  });

  test('signals created by one copy are recognized by the other', () => {
    const signal = first.createSignal(1);
    expect(second.isSignal(signal)).toBe(true);
    expect(signal instanceof second.SignalImpl).toBe(true);
    expect(signal instanceof second.WrappedSignalImpl).toBe(false);
    expect(signal instanceof second.ComputedSignalImpl).toBe(false);

    const computed = Object.create(first.ComputedSignalImpl.prototype);
    expect(computed instanceof second.ComputedSignalImpl).toBe(true);
    expect(computed instanceof second.SignalImpl).toBe(true);
    expect(computed instanceof second.WrappedSignalImpl).toBe(false);
  });

  test('tasks and JSX nodes created by one copy are recognized by the other', () => {
    expect(second.isTask(Object.create(first.Task.prototype))).toBe(true);
    expect(second.isJSXNode(Object.create(first.JSXNodeImpl.prototype))).toBe(true);
    expect(second.isTask({})).toBe(false);
  });

  test('components the renderer recognizes by identity are shared', () => {
    expect(first.Slot).toBe(second.Slot);
    expect(first.Fragment).toBe(second.Fragment);
    expect(first.SSRRaw).toBe(second.SSRRaw);
    expect(first.SSRComment).toBe(second.SSRComment);
    expect(first.SSRStream).toBe(second.SSRStream);
    expect(first.SSRStreamBlock).toBe(second.SSRStreamBlock);
  });

  test('private marker symbols are shared', () => {
    expect(first._OWNER).toBe(second._OWNER);
    expect(first._PROPS_HANDLER).toBe(second._PROPS_HANDLER);
    expect(first._CONST_PROPS).toBe(second._CONST_PROPS);
    expect(first._VAR_PROPS).toBe(second._VAR_PROPS);
    expect(first._IMMUTABLE).toBe(second._IMMUTABLE);
    expect(first._UNINITIALIZED).toBe(second._UNINITIALIZED);
    expect(first.NoSerializeSymbol).toBe(second.NoSerializeSymbol);
    expect(first.SerializerSymbol).toBe(second.SerializerSymbol);
    expect(first.STORE_TARGET).toBe(second.STORE_TARGET);
    expect(first.STORE_HANDLER).toBe(second.STORE_HANDLER);
    expect(first.NEEDS_COMPUTATION).toBe(second.NEEDS_COMPUTATION);
  });

  test('registered symbols and captures are shared', () => {
    const registered = () => 'registered';
    first._regSymbol(registered, 'shared_hash');
    expect(second.getSingleton<Map<string, unknown>>('regSymbols')!.get('shared_hash')).toBe(
      registered
    );

    const captures = ['a'];
    first.setCaptures(captures);
    expect(second._capturesObj._).toBe(captures);
    // Libraries built before `_capturesObj` read the legacy binding of their own copy.
    expect(first.qrlClassModule._captures).toBe(captures);
    first.setCaptures(null);
  });

  test('cursors queued by one copy are drained by the other', () => {
    const container = { $pendingCount$: 0 } as any;
    const cursor = { flags: 0 } as any;
    first.setCursorData(cursor, { priority: 1 } as any);
    first.addCursorToQueue(container, cursor);
    expect(second.getHighestPriorityCursor()).toBe(cursor);
    expect(second.removeCursorFromQueue(cursor, container)).toBe(true);
    expect(first.getHighestPriorityCursor()).toBeNull();
  });

  test('reveal group ids count per container across copies', () => {
    const container = {} as any;
    const idOf = (coordinator: any) => coordinator.id;
    const fromFirst = first.invoke({ $container$: container } as any, () =>
      first.createOutOfOrderRevealCoordinator('parallel', false)
    );
    const fromSecond = second.invoke({ $container$: container } as any, () =>
      second.createOutOfOrderRevealCoordinator('parallel', false)
    );
    expect(idOf(fromSecond)).toBe(idOf(fromFirst) + 1);
  });

  test('runtime QRL symbols never collide between copies', () => {
    const fromFirst = first.$(() => 1) as any;
    const fromSecond = second.$(() => 2) as any;
    expect(fromFirst.$symbol$).not.toBe(fromSecond.$symbol$);
  });
});
