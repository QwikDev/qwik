import { Computed } from '../reactive/computed';
import { Signal } from '../reactive/signal';
import { getStoreSource, isStore, StorePropSource } from '../reactive/store';
import { readSourceValue, type Source, type SourceSubs } from '../reactive/source';
import { isQrl } from '../shared/qrl/qrl-utils';
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
    // A plain value means the caller passed a static prop: it stays a snapshot.
    if (!isSource(sources[key]) && !isQrl(sources[key])) {
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

/** A prop read through its record: the member can change with a computed key or a spread. */
export class PropSource<T = unknown> implements Source<T> {
  subs: SourceSubs = null;

  constructor(
    public props: object = {},
    public key: string = ''
  ) {}

  get v(): T {
    return (this.props as Record<string, T>)[this.key];
  }
}

/** Sources are nominal, so a plain value in a source's place means a constant. */
export function isSource(value: unknown): value is Source {
  return value instanceof Signal || value instanceof StorePropSource || value instanceof PropSource;
}

/**
 * What backs one prop: a source an effect can capture instead of the record, or the plain value of
 * a static prop, which nothing can change for the component's life.
 */
export function propSource<T>(props: object, key: string): Source<T> | T {
  const registered = propsSources.get(props)?.[key];
  if (registered !== undefined && !isQrl(registered)) {
    return registered as Source<T>;
  }
  return registered !== undefined || propsProxyStates.has(props)
    ? new PropSource<T>(props, key)
    : (props as Record<string, T>)[key];
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
