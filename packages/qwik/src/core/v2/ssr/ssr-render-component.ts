import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { type Component, type OnRenderFn } from '../../component/component.public';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import type { QRLInternal } from '../../qrl/qrl-class';
import { ELEMENT_PROPS, OnRenderProp } from '../../util/markers';
import { type SSRContainer } from './types';

export const applyInlineComponent = (component: Component, jsx: JSXNode) => {
  return component(jsx.props, jsx.key, jsx.flags);
};

export const applyQwikComponentBody = (ssr: SSRContainer, jsx: JSXNode, component: Component) => {
  const host = ssr.getLastNode();
  const [componentQrl] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  const srcProps = jsx.props;
  const scheduler = ssr.$scheduler$;
  host.setProp(OnRenderProp, componentQrl);
  host.setProp(ELEMENT_PROPS, srcProps);
  scheduler.$scheduleComponent$(host, componentQrl, srcProps);
  return scheduler.$drainComponent$(host);
};
