/** Virtual module source for devtools tracking. Collects hooks and tracks render statistics. */
const useCollectHooks = `import { $, useSignal, useVisibleTask$ } from "@qwik.dev/core"

function initComponentState() {
  return {
    hooks: [],
    stats: {}
  }
}

function getOrCreateState(src) {
  if (!window.QWIK_DEVTOOLS_GLOBAL_STATE) {
    window.QWIK_DEVTOOLS_GLOBAL_STATE = {}
  }
  if (!window.QWIK_DEVTOOLS_GLOBAL_STATE[src]) {
    window.QWIK_DEVTOOLS_GLOBAL_STATE[src] = initComponentState()
  }
  return window.QWIK_DEVTOOLS_GLOBAL_STATE[src]
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
