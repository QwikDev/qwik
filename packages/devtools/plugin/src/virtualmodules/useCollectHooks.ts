import { QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { createRuntimeInstallerSource } from '../runtime/create-runtime-module';

const globalKey = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key);
const globalVersion = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.version);
const componentStateKey = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.componentState);

/**
 * Whether SSR can serialize a hook value: primitives, signals and stores (via `isReactive`), QRLs,
 * and plain objects or arrays of those.
 *
 * Self-contained because it is emitted by name into the collector module.
 */
export function __qwik_is_serializable_hook_value__(
  value: unknown,
  isReactive: (value: unknown) => boolean,
  seen: Set<object> = new Set()
): boolean {
  if (typeof value === 'function') {
    // QRLs are the only functions Qwik serializes.
    return typeof (value as { getSymbol?: unknown }).getSymbol === 'function';
  }
  if (typeof value !== 'object' || value === null) {
    return typeof value !== 'symbol';
  }
  if (isReactive(value) || seen.has(value)) {
    return true;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!(i in value) || !__qwik_is_serializable_hook_value__(value[i], isReactive, seen)) {
        return false;
      }
    }
    return true;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  for (const item of Object.values(value)) {
    if (!__qwik_is_serializable_hook_value__(item, isReactive, seen)) {
      return false;
    }
  }
  return true;
}

/** Virtual module source for devtools tracking. Collects hooks and tracks render statistics. */
const useCollectHooks = `import { $, isServer, isSignal, useSignal, useVisibleTask$ } from "@qwik.dev/core"
import { _getContextContainer, _getContextHostElement, _isStore } from "@qwik.dev/core/internal"

${createRuntimeInstallerSource(__qwik_is_serializable_hook_value__)}

const isReactive = (value) => isSignal(value) || _isStore(value)

// SSR serializes the collected hooks, but custom hook values may not be serializable.
function stripUnserializableData(args) {
  if (!isServer || args.hookType !== 'customhook') {
    return args
  }
  return __qwik_is_serializable_hook_value__(args.data, isReactive) ? args : { ...args, data: undefined }
}

function initComponentState() {
  return {
    hooks: [],
    stats: {}
  }
}

function getOrCreateState(src) {
  const root = window[${globalKey}] || (window[${globalKey}] = { version: ${globalVersion} })
  root.version = root.version || ${globalVersion}
  if (!root[${componentStateKey}]) {
    root[${componentStateKey}] = {}
  }
  if (!root[${componentStateKey}][src]) {
    root[${componentStateKey}][src] = initComponentState()
  }
  return root[${componentStateKey}][src]
}

/**
 * Hook to collect component hooks
 */
export const useCollectHooks = (src) => {
  const container = _getContextContainer()
  const host = _getContextHostElement()
  const symbol = container?.getHostProp(host, "q:renderFn")?.getSymbol?.()
  const hooksList = useSignal(new Set())
  useVisibleTask$(({ track }) => {
    const newHooks = track(() => hooksList.value)
    const state = getOrCreateState(src)
    state.hooks = [...newHooks]
    state.symbol = symbol
    window[${globalKey}]?.hook?.refreshVNodeTree?.()
  }, { strategy: 'document-ready' })
  
  return $((args) => {
    hooksList.value.add(stripUnserializableData(args))
    if (typeof window !== 'undefined') {
      getOrCreateState(src).hooks = [...hooksList.value]
      window[${globalKey}]?.hook?.refreshVNodeTree?.()
    }
  })
}
`;

export default useCollectHooks;
