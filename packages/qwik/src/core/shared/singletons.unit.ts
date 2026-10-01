import { describe, expect, test, vi } from 'vitest';

(globalThis as any).QWIK_VERSION ??= '0.0.0-test';

const loadCoreCopy = async () => {
  vi.resetModules();
  const invoke = await import('../runtime/invoke-context');
  const tracking = await import('../reactive/tracking');
  const signals = await import('../reactive/public-api');
  const signal = await import('../reactive/signal');
  const computed = await import('../reactive/computed');
  const computedQrl = await import('../reactive/computed-qrl');
  const asyncSignal = await import('../reactive/async-signal');
  const serializer = await import('../reactive/serializer-signal');
  const store = await import('../reactive/store');
  const props = await import('../component/props');
  const owner = await import('../runtime/owner');
  const scope = await import('../runtime/context-scope');
  const context = await import('../runtime/context');
  const task = await import('../runtime/task');
  const slot = await import('../dom/slot/slot');
  const effect = await import('../dom/effect/ssr-effect');
  const branch = await import('../dom/branch/branch');
  const content = await import('../dom/content/content');
  const qrl = await import('./qrl/qrl-class');
  const qrlUtils = await import('./qrl/qrl-utils');
  const component = await import('./component.public');
  const verify = await import('./serdes/verify');
  const standalone = await import('./serdes/standalone');
  const constants = await import('./serdes/constants');
  return {
    ...invoke,
    ...tracking,
    ...signals,
    ...signal,
    ...computed,
    ...computedQrl,
    ...asyncSignal,
    ...serializer,
    ...store,
    ...props,
    ...owner,
    ...scope,
    ...context,
    ...task,
    ...slot,
    ...effect,
    ...branch,
    ...content,
    ...qrl,
    ...qrlUtils,
    ...component,
    ...verify,
    ...standalone,
    ...constants,
  };
};

describe('duplicate core copies', async () => {
  const first = await loadCoreCopy();
  const second = await loadCoreCopy();

  test('share invoke context and restore it after nested calls', () => {
    const context = first.newInvokeContext();
    const nested = second.newInvokeContext();
    const id = first.createContextId<string>('external-library');
    first.invoke(context, () => {
      first.useContextProvider(id, 'provided');
      expect(second.useContext(id)).toBe('provided');
      expect(() =>
        second.invoke(nested, () => {
          throw new Error('nested');
        })
      ).toThrow('nested');
      expect(second.getActiveInvokeContext()).toBe(context);
    });
    expect(second.getActiveInvokeContextOrNull()).toBeNull();
  });

  test('track reads and untrack writes across copies', () => {
    const source = new second.Signal(0);
    const collector = new first.Computed(null, () => source.value);
    first.runWithCollector(collector, () => {
      expect(second.getActiveCollector()).toBe(collector);
      expect(source.value).toBe(0);
      second.untrack(() => {
        expect(first.getActiveCollector()).toBeNull();
      });
      expect(first.getActiveCollector()).toBe(collector);
    });
    expect(collector.deps).toEqual([source]);
    expect(second.getActiveCollector()).toBeNull();
  });

  test('restore shared tracking and context for an await continuation', async () => {
    const context = first.newInvokeContext();
    const collector = new first.Computed(null, () => 0);
    const resume = await first.invoke(context, () =>
      first.runWithCollector(collector, () => second._await(Promise.resolve(1)))
    );
    expect(resume()).toBe(1);
    expect(first.getActiveInvokeContext()).toBe(context);
    expect(first.getActiveCollector()).toBe(collector);
    await Promise.resolve();
    expect(second.getActiveInvokeContextOrNull()).toBeNull();
    expect(second.getActiveCollector()).toBeNull();
  });

  test('recognize nominal values from another copy without accepting plain objects', () => {
    const classes = [
      'Signal',
      'Computed',
      'ComputedQrl',
      'AsyncSignal',
      'SerializerSignal',
      'StorePropSource',
      'PropSource',
      'Owner',
      'ContextScope',
      'TaskSubscription',
      'VisibleTaskSubscription',
      'SsrDomEffectBase',
      'SsrDomSubscription',
      'SSRBranchSubscription',
      'SSRForBlockSubscription',
      'SSRContentSubscription',
      'SSRSuspenseContentSubscription',
    ] as const;
    for (let i = 0; i < classes.length; i++) {
      const name = classes[i];
      expect(first[name]).not.toBe(second[name]);
      expect(Object.create(first[name].prototype) instanceof second[name], name).toBe(true);
      expect({} instanceof second[name], name).toBe(false);
    }
    const computed = new first.Computed(null, () => 1);
    expect(computed instanceof second.Signal).toBe(true);
    expect(computed instanceof second.AsyncSignal).toBe(false);
  });

  test('share store proxies and their property sources', () => {
    const raw = { count: 0 };
    const store = first.useStore(raw);
    expect(second.useStore(raw)).toBe(store);
    expect(second.isStore(store)).toBe(true);
    expect(second.unwrapStore(store)).toBe(raw);
    expect(second.getStoreSource(store, 'count')).toBe(first.getStoreSource(raw, 'count'));
  });

  test('round-trip foreign signals, stores, scopes and projections', async () => {
    const source = new second.Signal(7);
    const store = second.useStore({ count: 2 });
    const scope = second.createContextScope(null);
    scope.values.set('greeting', store);
    const slot = second.createSlotScope();
    second.registerProjection(slot, '', null);
    const owner = second.createOwner(null);
    const restored = await first._deserialize<any[]>(
      await first._serialize([source, store, scope, slot, owner])
    );
    expect(restored[0] instanceof first.Signal).toBe(true);
    expect(restored[0].value).toBe(7);
    expect(first.isStore(restored[1])).toBe(true);
    expect(restored[2].values.get('greeting')).toBe(restored[1]);
    expect(first.isSlotScope(restored[3])).toBe(true);
    expect(first.isProjection(restored[3].projections[0])).toBe(true);
    expect(restored[4] instanceof first.Owner).toBe(true);
  });

  test('round-trip foreign reactive props without taking a snapshot', async () => {
    const source = new second.Signal('initial');
    const props = second._props(
      {
        get label() {
          return source.value;
        },
      },
      { label: source }
    );
    const [restored, restoredSource] = await first._deserialize<any[]>(
      await first._serialize([props, source])
    );
    restoredSource.value = 'updated';
    expect(restored.label).toBe('updated');
    const proxy = second.createPropsProxy(new second.Signal({ label: 'proxy' }));
    expect(first.getPropsProxyState(proxy)).toBeDefined();
  });

  test('recognize foreign component markers and resolved QRL bodies', () => {
    const component = second._markComponent(() => null, 'component', 'chunk');
    expect(first.isQwikComponent(component)).toBe(true);
    const body = () => 1;
    const qrl = second.createQRL('chunk', 'body', body);
    expect(first.qrlOfBody(qrl.resolved)).toBeDefined();
  });

  test('share the captured scope with a function from another copy', () => {
    const captures = ['captured'];
    const body = () => second._capturesObj._;
    expect(first.withCaptures(body, captures)()).toBe(captures);
    first.setCaptures(null);
  });

  test('keep noSerialize and custom serializer protocols across copies', async () => {
    const privateValue = second.noSerialize({ secret: 'private-value' });
    expect(first.fastSkipSerialize(privateValue)).toBe(true);
    expect(first.fastSkipSerialize({ [second.NoSerializeSymbol]: true })).toBe(true);
    class CustomValue {
      [second.SerializerSymbol]() {
        return 'public-value';
      }
    }
    expect(await first._deserialize(await first._serialize(new CustomValue()))).toBe(
      'public-value'
    );
    expect(await first._serialize([privateValue])).not.toContain('private-value');
  });

  test('allow a second public core entry with the same version and build', async () => {
    vi.resetModules();
    const firstEntry = await import('../index');
    vi.resetModules();
    const secondEntry = await import('../index');
    expect(secondEntry._capturesObj).toBe(firstEntry._capturesObj);
    expect(secondEntry._capturesObj).toBeDefined();
  });

  test('reject a different server core version', async () => {
    vi.resetModules();
    vi.doMock('../version', () => ({ version: '0.0.0-other' }));
    try {
      await expect(import('../index')).rejects.toThrow(/Q30|already imported/);
    } finally {
      vi.doUnmock('../version');
    }
  });

  test('reject the same version with an incompatible server build', async () => {
    const { qwikGlobal } = await import('./singletons');
    const previous = qwikGlobal.version;
    qwikGlobal.version = previous!.replace('(development)', '(production)');
    vi.resetModules();
    try {
      await expect(import('../index')).rejects.toThrow(/Q30|already imported/);
    } finally {
      qwikGlobal.version = previous;
    }
  });

  test('keep markers of a different version separate', async () => {
    vi.resetModules();
    vi.doMock('../version', () => ({ version: '0.0.0-other' }));
    try {
      const { Signal } = await import('../reactive/signal');
      expect(new first.Signal(1) instanceof Signal).toBe(false);
      const { NoSerializeSymbol } = await import('./serdes/verify');
      expect(NoSerializeSymbol).not.toBe(first.NoSerializeSymbol);
    } finally {
      vi.doUnmock('../version');
    }
  });
});
