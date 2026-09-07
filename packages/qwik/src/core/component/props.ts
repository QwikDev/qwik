import { Computed } from '../reactive/computed';
import { Signal } from '../reactive/signal';
import { getStoreSource, isStore } from '../reactive/store';
import { readSourceValue, type Source } from '../reactive/source';
import { track } from '../reactive/tracking';
import { qError, QError } from '../shared/error/error';

type PropsProxyState<T extends object> =
  | { source: Source<T> | null; excluded: null }
  | { source: T | null; excluded: readonly string[] };

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
    return getStoreSource(target as object, prop);
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

export function createPropsProxy<T extends object>(source: Source<T>): T;
export function createPropsProxy<T extends object>(props: T, excluded: readonly string[]): T;
export function createPropsProxy<T extends object>(
  source: Source<T> | T,
  excluded?: readonly string[]
): T {
  return createPropsProxyState(
    excluded === undefined
      ? { source: source as Source<T>, excluded: null }
      : { source: source as T, excluded }
  );
}

export function allocatePropsProxy(): object {
  return createPropsProxyState({ source: null, excluded: null });
}

export function getPropsProxyState(proxy: object): PropsProxyState<object> | undefined {
  return propsProxyStates.get(proxy);
}

export function restorePropsProxyState(proxy: object, restored: PropsProxyState<object>): void {
  const state = propsProxyStates.get(proxy);
  if (state === undefined) {
    throw new Error('Invalid props proxy');
  }
  Object.assign(state, restored);
}

function createPropsProxyState<T extends object>(state: PropsProxyState<T>): T {
  const readProps = (): T => {
    if (state.source === null) {
      throw qError(QError.uninitializedPropsProxy);
    }
    if (state.excluded !== null) {
      return state.source;
    }
    track(state.source);
    return readSourceValue(state.source);
  };
  const proxy = new Proxy(Object.create(null), {
    get: (_target, property) => {
      if (state.source === null && property === 'then') {
        return undefined;
      }
      const props = readProps();
      return isIncludedProp(props, property, state.excluded)
        ? Reflect.get(props, property, props)
        : undefined;
    },
    has: (_target, property) => {
      const props = readProps();
      return isIncludedProp(props, property, state.excluded) && Reflect.has(props, property);
    },
    ownKeys: () => {
      const props = readProps();
      const keys = Reflect.ownKeys(props);
      return state.excluded === null
        ? keys
        : keys.filter((key) => isIncludedProp(props, key, state.excluded));
    },
    getOwnPropertyDescriptor: (_target, property) => {
      const props = readProps();
      const descriptor = isIncludedProp(props, property, state.excluded)
        ? Reflect.getOwnPropertyDescriptor(props, property)
        : undefined;
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
    },
  }) as T;
  propsProxyStates.set(proxy, state as PropsProxyState<object>);
  return proxy;
}

function isIncludedProp(
  props: object,
  property: string | symbol,
  excluded: readonly string[] | null
): boolean {
  return (
    excluded === null ||
    (!(typeof property === 'string' && excluded.includes(property)) &&
      Object.prototype.propertyIsEnumerable.call(props, property))
  );
}
