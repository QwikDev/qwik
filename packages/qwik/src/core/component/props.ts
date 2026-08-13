import { Computed } from '../reactive/computed';
import { Signal } from '../reactive/signal';
import { getStoreSource, isStore } from '../reactive/store';
import { readSourceValue, type Source } from '../reactive/source';
import { track } from '../reactive/tracking';
import { qError, QError } from '../shared/error/error';

interface PropsProxyState<T extends object> {
  source: Source<T> | null;
}

const propsProxyStates = new WeakMap<object, PropsProxyState<object>>();

/**
 * Reactive props are getters, which serialize to a snapshot of whatever they returned. The map
 * records what each reactive key reads from so serialization can store that instead.
 */
const propsSources = new WeakMap<object, Record<string, unknown>>();

export function _props<T extends object>(props: T, sources: Record<string, unknown>): T {
  for (const key in sources) {
    if (sources[key] === undefined) {
      // an undefined source means the caller passed a static value: snapshot path
      delete sources[key];
    }
  }
  propsSources.set(props, sources);
  return props;
}

export function getPropsSources(props: object): Record<string, unknown> | undefined {
  return propsSources.get(props);
}

/** The source a caller registered for a prop key, for forwarding it further down. */
export function getPropSource(props: object, key: string): unknown {
  return propsSources.get(props)?.[key];
}

/**
 * The source behind reading `prop` off `target`, whatever target turns out to be. Property slots
 * are runtime facts — a store prop can hold a signal, a nested store, or plain data — so the
 * compiler emits this probe wherever the chain cannot be proven statically.
 */
export function getMemberSource(target: unknown, prop: string): unknown {
  if (isStore(target)) {
    return getStoreSource(target, prop);
  }
  if (prop === 'value' && (target instanceof Signal || target instanceof Computed)) {
    return target;
  }
  return undefined;
}

export function mergeProps(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (source != null) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    }
  }
  return target;
}

export function createPropsProxy<T extends object>(source: Source<T>): T {
  return createPropsProxyState(source);
}

export function allocatePropsProxy(): object {
  return createPropsProxyState(null);
}

export function getPropsProxySource(proxy: object): Source<object> | null | undefined {
  return propsProxyStates.get(proxy)?.source;
}

export function restorePropsProxySource(proxy: object, source: Source<object>): void {
  const state = propsProxyStates.get(proxy);
  if (state === undefined) {
    throw new Error('Invalid props proxy');
  }
  state.source = source;
}

function createPropsProxyState<T extends object>(source: Source<T> | null): T {
  const state: PropsProxyState<T> = { source };
  const readProps = (): T => {
    const source = state.source;
    if (source === null) {
      throw qError(QError.uninitializedPropsProxy);
    }
    track(source);
    return readSourceValue(source);
  };
  const proxy = new Proxy(Object.create(null), {
    get: (_target, property) => {
      if (state.source === null && property === 'then') {
        return undefined;
      }
      const props = readProps();
      return Reflect.get(props, property, props);
    },
    has: (_target, property) => Reflect.has(readProps(), property),
    ownKeys: () => Reflect.ownKeys(readProps()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(readProps(), property);
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
    },
  }) as T;
  propsProxyStates.set(proxy, state as PropsProxyState<object>);
  return proxy;
}
