import { Brand, brandClass } from '../shared/utils/brand';
import { isDev, isServer } from '@qwik.dev/core/build';
import { Signal } from '../reactive/signal';
import { StorePropSource } from '../reactive/store';
import { readSourceValue, type Source, type SourceSubs } from '../reactive/source';
import { isQrl } from '../shared/qrl/qrl-utils';
import { track } from '../reactive/tracking';
import { invalidStateError, qError, QError } from '../shared/error/error';
import { registerSingleton } from '../shared/singletons';
import { logWarn } from '../shared/utils/log';

type PropsProxyState<T extends object> =
  | { source: Source<T> | null; excluded: null }
  | { source: T | null; excluded: readonly string[] };

const propsProxyStates = /*#__PURE__*/ registerSingleton(
  'v3.propsProxyStates',
  () => new WeakMap<object, PropsProxyState<object>>()
);

/**
 * Reactive props are getters, which serialize to a snapshot of whatever they returned. The map
 * records what each reactive key reads from so serialization can store that instead.
 */
const propsSources = /*#__PURE__*/ registerSingleton(
  'v3.propsSources',
  () => new WeakMap<object, Record<string, unknown>>()
);

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
  if (registered !== undefined || propsProxyStates.has(props)) {
    return new PropSource<T>(props, key);
  }
  const value = (props as Record<string, T>)[key];
  return isSource(value) ? new PropSource<T>(props, key) : value;
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
    throw isDev ? invalidStateError('props proxy') : invalidStateError();
  }
  Object.assign(state, restored);
}

const reportedThenProps = /*#__PURE__*/ new WeakSet<object>();

function readProps<T extends object>(state: PropsProxyState<T>): T {
  if (state.source === null) {
    throw qError(QError.uninitializedPropsProxy);
  }
  let props: T;
  if (state.excluded !== null) {
    props = state.source;
  } else {
    track(state.source);
    props = readSourceValue(state.source);
  }
  if (
    isDev &&
    !reportedThenProps.has(state) &&
    Object.prototype.hasOwnProperty.call(props, 'then')
  ) {
    reportedThenProps.add(state);
    logWarn('A prop named "then" always reads as undefined: props are never thenables.');
  }
  return props;
}

/** Shared by every props proxy, whose target is its own state. */
const ignoreWrite = () => true;

const propsProxyHandler: ProxyHandler<PropsProxyState<object>> = {
  get(state, property) {
    // a props record is never a thenable; Promise.resolve must not read its source
    if (property === 'then') {
      return undefined;
    }
    const props = readProps(state);
    return isIncludedProp(props, property, state.excluded)
      ? Reflect.get(props, property, props)
      : undefined;
  },
  has(state, property) {
    const props = readProps(state);
    return isIncludedProp(props, property, state.excluded) && Reflect.has(props, property);
  },
  ownKeys(state) {
    const props = readProps(state);
    const keys = Reflect.ownKeys(props);
    if (state.excluded === null) {
      return keys;
    }
    const included: (string | symbol)[] = [];
    for (let i = 0; i < keys.length; i++) {
      if (isIncludedProp(props, keys[i], state.excluded)) {
        included.push(keys[i]);
      }
    }
    return included;
  },
  getOwnPropertyDescriptor(state, property) {
    const props = readProps(state);
    const descriptor = isIncludedProp(props, property, state.excluded)
      ? Reflect.getOwnPropertyDescriptor(props, property)
      : undefined;
    return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
  },
  getPrototypeOf: () => null,
  // A write to props must not reach the state; it never showed through the proxy anyway.
  set: ignoreWrite,
  deleteProperty: ignoreWrite,
  defineProperty: ignoreWrite,
};

function createPropsProxyState<T extends object>(state: PropsProxyState<T>): T {
  const proxy = new Proxy(state as PropsProxyState<object>, propsProxyHandler) as T;
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

isServer && brandClass(PropSource, Brand.PropSource);
