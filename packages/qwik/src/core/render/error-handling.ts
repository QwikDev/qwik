import type { ContainerState } from '../container/container';
import { isServerPlatform } from '../platform/platform';
import { tryGetContext } from '../state/context';
import { createContextId, resolveContext, resolveContext2 } from '../use/use-context';
import { isVirtualElement } from '../util/element';
import { qDev } from '../util/qdev';
import type { VirtualVNode } from '../v2/client/types';
import { vnode_getDOMChildNodes, vnode_insertBefore, vnode_newElement } from '../v2/client/vnode';
import type { Container2, fixMeAny } from '../v2/shared/types';
import type { QwikElement } from './dom/virtual-element';

/** @public */
export interface ErrorBoundaryStore {
  error: any | undefined;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

export const handleError2 = (err: any, vHost: VirtualVNode, container: Container2) => {
  if (qDev) {
    // Clean vdom
    if (!isServerPlatform() && typeof document !== 'undefined') {
      const errorDiv = document.createElement('errored-host');
      if (err && err instanceof Error) {
        (errorDiv as any).props = { error: err };
      }
      errorDiv.setAttribute('q:key', '_error_');
      errorDiv.append(...vnode_getDOMChildNodes(vHost));
      const vErrorDiv = vnode_newElement(vHost, errorDiv, 'error-host');
      vnode_insertBefore(vHost, vErrorDiv, null);
    }

    if (err && err instanceof Error) {
      if (!('hostElement' in err)) {
        (err as any)['hostElement'] = vHost;
      }
    }
    if (!isRecoverable(err)) {
      throw err;
    }
  }
  if (isServerPlatform()) {
    throw err;
  } else {
    const errorStore = container.resolveContext(vHost as fixMeAny, ERROR_CONTEXT);
    if (!errorStore) {
      throw err;
    }
    errorStore.error = err;
  }
};

export const handleError = (err: any, hostElement: QwikElement, containerState: ContainerState) => {
  const elCtx = tryGetContext(hostElement)!;
  if (qDev) {
    // Clean vdom
    if (!isServerPlatform() && typeof document !== 'undefined' && isVirtualElement(hostElement)) {
      // (hostElement as any).$vdom$ = null;
      elCtx.$vdom$ = null;
      const errorDiv = document.createElement('errored-host');
      if (err && err instanceof Error) {
        (errorDiv as any).props = { error: err };
      }
      errorDiv.setAttribute('q:key', '_error_');
      errorDiv.append(...hostElement.childNodes);
      hostElement.appendChild(errorDiv);
    }

    if (err && err instanceof Error) {
      if (!('hostElement' in err)) {
        (err as any)['hostElement'] = hostElement;
      }
    }
    if (!isRecoverable(err)) {
      throw err;
    }
  }
  if (isServerPlatform()) {
    throw err;
  } else {
    const errorStore = resolveContext(ERROR_CONTEXT, elCtx, containerState);
    if (errorStore === undefined) {
      throw err;
    }
    errorStore.error = err;
  }
};

const isRecoverable = (err: any) => {
  if (err && err instanceof Error) {
    if ('plugin' in err) {
      return false;
    }
  }
  return true;
};
