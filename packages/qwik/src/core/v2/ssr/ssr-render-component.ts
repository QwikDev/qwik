import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { type Component, type OnRenderFn } from '../../component/component.public';
import { createContainerState, type ContainerState } from '../../container/container';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import type { QRLInternal } from '../../qrl/qrl-class';
import { createRenderContext, executeComponent } from '../../render/execute-component';
import type { RenderContext } from '../../render/types';
import { createContext, type QContext } from '../../state/context';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { ELEMENT_PROPS, ELEMENT_SEQ, OnRenderProp } from '../../util/markers';
import { maybeThen } from '../../util/promises';
import { executeComponent2 } from '../shared/component-execution';
import { SsrNode, type SSRContainer } from './types';

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
  return executeComponent2(host as any, componentQrl, propsSansChildren);
};

export const DELETE_applyQwikComponentHost = (
  jsx: JSXNode,
  component: Component<any>,
  ssr: SSRContainer
) => {
  return component(jsx.props, jsx.key, jsx.flags);
};

export const DELETE_applyQwikComponentBody = (jsx: JSXNode, ssr: SSRContainer) => {
  const hostElement = ssr.getLastNode();
  const containerState: ContainerState = createContainerState(
    new SsrNode(SsrNode.ELEMENT_NODE, '', EMPTY_ARRAY) as any,
    '/test/'
  );
  const rCtx: RenderContext = createRenderContext(null!, containerState);
  const elCtx: QContext = createContext(hostElement as any);
  const props = jsx.props.props;
  hostElement.setProp(ELEMENT_PROPS, String(ssr.addRoot(props)));
  const componentQRL = jsx.props[OnRenderProp];
  hostElement.setProp(OnRenderProp, String(ssr.addRoot(componentQRL)));

  elCtx.$props$ = jsx.props.props as any;
  elCtx.$componentQrl$ = jsx.props[OnRenderProp] as any;
  return maybeThen(executeComponent(rCtx, elCtx), (v) => {
    if (elCtx.$seq$) {
      hostElement.setProp(ELEMENT_SEQ, String(ssr.addRoot(elCtx.$seq$)));
    }
    // TODO(misko): this should be move to the ssr-render.ts and should only be done once for the whole app.
    // const meta = serializeComponentContext(
    //   elCtx,
    //   (v) => {
    //     // console.log('getObjectID', v);
    //     return String(ssr.serializationCtx.$addRoot$(v));
    //   },
    //   (v) => {
    //     // console.log('mustGetObjId', v);
    //     return String(ssr.serializationCtx.$addRoot$(v));
    //   },
    //   true,
    //   true,
    //   {}
    // );
    // if (meta) {
    //   const id = String(ssr.serializationCtx.$addRoot$(meta));
    //   hostElement.setAttribute(ELEMENT_ID, id);
    // }
    return v.node;
  });
};
