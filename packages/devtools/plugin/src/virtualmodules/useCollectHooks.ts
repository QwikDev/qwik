import { QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';

const globalKey = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.key);
const globalVersion = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.version);
const componentStateKey = JSON.stringify(QWIK_DEVTOOLS_GLOBAL.props.componentState);

/** Virtual module source for devtools tracking. Collects hooks and tracks render statistics. */
const useCollectHooks = `import { $, useSignal, useVisibleTask$ } from "@qwik.dev/core"

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
  const hooksList = useSignal(new Set())
  useVisibleTask$(({ track }) => {
    const newHooks = track(() => hooksList.value)
    const state = getOrCreateState(src)
    state.hooks = [...newHooks]
  }, { strategy: 'document-ready' })
  
  return $((args) => {
    if (hooksList.value.has(args)) {
      return
    }
    hooksList.value.add(args)
  })
}
`;

export default useCollectHooks;
