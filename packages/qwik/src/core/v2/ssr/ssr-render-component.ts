import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { type Component, type OnRenderFn } from '../../component/component.public';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import type { QRLInternal } from '../../qrl/qrl-class';
import { ELEMENT_PROPS, OnRenderProp } from '../../util/markers';
import { executeComponent2 } from '../shared/component-execution';
import { type SSRContainer } from './types';

export const applyInlineComponent = (component: Component<any>, jsx: JSXNode<Function>) => {
  return component(jsx.props, jsx.key, jsx.flags);
};

export const applyQwikComponentBody = (
  ssr: SSRContainer,
  jsx: JSXNode,
  component: Component<any>
) => {
  const host = ssr.getLastNode();
  const [componentQrl] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  const srcProps = jsx.props;
  let hasProps = false;
  const propsSansChildren: any = {};
  for (const key in srcProps) {
    if (Object.prototype.hasOwnProperty.call(srcProps, key) && key !== 'children') {
      propsSansChildren[key] = srcProps[key];
      hasProps = true;
    }
  }
  host.setProp(OnRenderProp, componentQrl);
  hasProps && host.setProp(ELEMENT_PROPS, propsSansChildren);
  return executeComponent2(ssr, host as any, componentQrl, propsSansChildren);
};

