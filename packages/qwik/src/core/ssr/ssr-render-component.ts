import type { JSXNode } from '@builder.io/qwik';
import { SERIALIZABLE_STATE, type Component, type OnRenderFn } from '../shared/component.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { ELEMENT_KEY, ELEMENT_PROPS, OnRenderProp } from '../shared/utils/markers';
import { type ISsrNode, type SSRContainer } from './ssr-types';
import { executeComponent } from '../shared/component-execution';
import { ChoreType } from '../shared/scheduler';
import type { ValueOrPromise } from '../shared/utils/types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';

export const applyInlineComponent = (
  ssr: SSRContainer,
  component$Host: ISsrNode,
  component: OnRenderFn<any>,
  jsx: JSXNode
) => {
  const host = ssr.getLastNode();
  return executeComponent(ssr, host, component$Host, component, jsx.props);
};

export const applyQwikComponentBody = (
  ssr: SSRContainer,
  jsx: JSXNode,
  component: Component
): ValueOrPromise<JSXOutput> => {
  const host = ssr.getLastNode();
  const [componentQrl] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  const srcProps = jsx.props;
  if (srcProps && srcProps.children) {
    delete srcProps.children;
  }
  const scheduler = ssr.$scheduler$;
  host.setProp(OnRenderProp, componentQrl);
  host.setProp(ELEMENT_PROPS, srcProps);
  if (jsx.key !== null) {
    host.setProp(ELEMENT_KEY, jsx.key);
  }
  return scheduler(ChoreType.COMPONENT_SSR, host, componentQrl, srcProps);
};
