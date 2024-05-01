import type { JSXNode } from '@builder.io/qwik';
import { type Component, type OnRenderFn } from '../../component/component.public';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import type { QRLInternal } from '../../qrl/qrl-class';
import { ELEMENT_KEY, ELEMENT_PROPS, OnRenderProp } from '../../util/markers';
import { type ISsrNode, type SSRContainer } from './ssr-types';
import { executeComponent2 } from '../shared/component-execution';
import { ChoreType } from '../shared/scheduler';
import type { ValueOrPromise } from '../../util/types';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';

export const applyInlineComponent = (
  ssr: SSRContainer,
  component$Host: ISsrNode,
  component: OnRenderFn<any>,
  jsx: JSXNode
) => {
  const host = ssr.getLastNode();
  return executeComponent2(ssr, host, component$Host, component, jsx.propsC);
};

export const applyQwikComponentBody = (
  ssr: SSRContainer,
  jsx: JSXNode,
  component: Component
): ValueOrPromise<JSXOutput> => {
  const host = ssr.getLastNode();
  const [componentQrl] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  const srcProps = jsx.props;
  const scheduler = ssr.$scheduler$;
  host.setProp(OnRenderProp, componentQrl);
  host.setProp(ELEMENT_PROPS, srcProps);
  if (jsx.key !== null) {
    host.setProp(ELEMENT_KEY, jsx.key);
  }
  if ('children' in srcProps) {
    delete srcProps.children;
  }
  return scheduler(ChoreType.COMPONENT_SSR, host, componentQrl, srcProps);
};
