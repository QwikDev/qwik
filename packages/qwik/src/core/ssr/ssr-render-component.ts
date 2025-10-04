import type { JSXNode } from '@qwik.dev/core';
import { SERIALIZABLE_STATE, type Component, type OnRenderFn } from '../shared/component.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { ELEMENT_KEY, ELEMENT_PROPS, OnRenderProp } from '../shared/utils/markers';
import { type ISsrNode, type SSRContainer } from './ssr-types';
import { executeComponent } from '../shared/component-execution';
import type { ValueOrPromise } from '../shared/utils/types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { ChoreType } from '../shared/util-chore-type';
import { getChorePromise } from '../shared/scheduler';

export const applyInlineComponent = (
  ssr: SSRContainer,
  componentHost: ISsrNode | null,
  inlineComponentFunction: OnRenderFn<any>,
  jsx: JSXNode
) => {
  const host = ssr.getOrCreateLastNode();
  return executeComponent(ssr, host, componentHost, inlineComponentFunction, jsx.props);
};

export const applyQwikComponentBody = (
  ssr: SSRContainer,
  jsx: JSXNode,
  component: Component
): ValueOrPromise<JSXOutput> => {
  const host = ssr.getOrCreateLastNode();
  const [componentQrl] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  const srcProps = jsx.props;
  if (srcProps && srcProps.children) {
    delete srcProps.children;
  }
  host.setProp(OnRenderProp, componentQrl);
  host.setProp(ELEMENT_PROPS, srcProps);
  if (jsx.key !== null) {
    host.setProp(ELEMENT_KEY, jsx.key);
  }
  const componentChore = ssr.$scheduler$(ChoreType.COMPONENT, host, componentQrl, srcProps);
  return getChorePromise(componentChore);
};
