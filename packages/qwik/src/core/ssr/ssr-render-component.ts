import type { JSXNode } from '@qwik.dev/core';
import type { OnRenderFn } from '../shared/component.public';
import type { HostElement } from '../shared/types';
import type { ISsrNode, SSRContainer } from './ssr-types';
import { executeComponent } from '../shared/component-execution';

export const applyInlineComponent = (
  ssr: SSRContainer,
  componentHost: ISsrNode | null,
  inlineComponentFunction: OnRenderFn<any>,
  jsx: JSXNode
) => {
  const host = ssr.getOrCreateLastNode();
  return executeComponent(
    ssr,
    host as unknown as HostElement,
    componentHost as unknown as HostElement,
    inlineComponentFunction,
    jsx.props
  );
};
