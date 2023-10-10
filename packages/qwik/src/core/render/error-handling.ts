import { isServerPlatform } from '../platform/platform';
import { tryGetContext } from '../state/context';
import { createContextId, resolveContext } from '../use/use-context';
import { isVirtualElement } from '../util/element';
import { qDev } from '../util/qdev';
import type { QwikElement } from './dom/virtual-element';
import type { RenderContext } from './types';

/** @public */
export interface ErrorBoundaryStore {
  error: any | undefined;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

export const handleError = (err: any, hostElement: QwikElement, rCtx: RenderContext) => {
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
    const errorStore = resolveContext(ERROR_CONTEXT, elCtx, rCtx.$static$.$containerState$);
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
