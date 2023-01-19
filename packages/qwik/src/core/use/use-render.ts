import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { getContext } from '../state/context';
import { useInvokeContext } from './use-core';

/**
 * @alpha
 */
export const useRender = (jsx: JSXNode) => {
  const iCtx = useInvokeContext();
  const hostElement = iCtx.$hostElement$;
  const elCtx = getContext(hostElement, iCtx.$renderCtx$.$static$.$containerState$);
  let extraRender = elCtx.$extraRender$;
  if (!extraRender) {
    extraRender = elCtx.$extraRender$ = [];
  }
  extraRender.push(jsx);
};
