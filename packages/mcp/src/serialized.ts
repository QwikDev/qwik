import * as qwikInternal from '@qwik.dev/core/internal';

const containerSelector = '[q\\:container]';
const forwardRefsType = 14;

export function readSerializedState(doc: Document): string | null {
  const container = doc.querySelector(containerSelector);
  if (!container) {
    return null;
  }
  const instance = container.getAttribute('q:instance');
  const scripts = [...container.querySelectorAll('script[type="qwik/state"]')].filter(
    (script) =>
      script.closest(containerSelector) === container &&
      (instance === null || script.getAttribute('q:instance') === instance)
  );
  const root = scripts.find((script) => !script.hasAttribute('q:patch'));
  if (!root && !scripts.some((script) => script.hasAttribute('q:patch'))) {
    return null;
  }
  const state = JSON.parse(root?.textContent || '[]') as unknown[];
  if (!Array.isArray(state)) {
    throw new Error('Invalid serialized Qwik state.');
  }
  const patchForwardRefs: Array<number | string> = [];
  for (const patch of scripts.filter((script) => script.hasAttribute('q:patch'))) {
    const [start, entries, forwardRefs] = JSON.parse(patch.textContent || '[]') as [
      number,
      unknown[],
      Array<number | string> | 0 | undefined,
    ];
    if (!Number.isInteger(start) || !Array.isArray(entries)) {
      throw new Error('Invalid serialized Qwik state patch.');
    }
    for (let index = 0; index < entries.length; index++) {
      state[start * 2 + index] = entries[index];
    }
    if (forwardRefs) {
      patchForwardRefs.push(...forwardRefs.filter((ref) => ref !== undefined));
    }
  }
  if (patchForwardRefs.length) {
    const forwardRefsIndex = state.findIndex(
      (value, index) => index % 2 === 0 && value === forwardRefsType
    );
    if (forwardRefsIndex === -1) {
      state.push(forwardRefsType, patchForwardRefs);
    } else {
      const existing = state[forwardRefsIndex + 1];
      state[forwardRefsIndex + 1] = Array.isArray(existing)
        ? [...existing, ...patchForwardRefs]
        : patchForwardRefs;
    }
  }
  qwikInternal._preprocessState(state, { $forwardRefs$: null } as Parameters<
    typeof qwikInternal._preprocessState
  >[1]);
  return qwikInternal._dumpState(state, false, '', null).replace(/^\n/, '');
}

export async function readSerializedVNodeTree(doc: Document): Promise<string | null> {
  const clone = new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html');
  const container = clone.querySelector(containerSelector);
  if (!container) {
    return null;
  }
  const domContainer = qwikInternal._getDomContainer(container);
  return await qwikInternal._whenContainerDataReady(domContainer, () =>
    qwikInternal._vnode_toString.call(domContainer.rootVNode, 20, '', true, false, false)
  );
}
