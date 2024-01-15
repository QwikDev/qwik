import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { Component } from '../../component/component.public';
import { createContainerState, type ContainerState } from '../../container/container';
import { serializeComponentContext } from '../../container/pause';
import { createRenderContext, executeComponent } from '../../render/execute-component';
import type { RenderContext } from '../../render/types';
import { createContext, type QContext } from '../../state/context';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { ELEMENT_ID, ELEMENT_PROPS, ELEMENT_SEQ, OnRenderProp } from '../../util/markers';
import { maybeThen } from '../../util/promises';
import { SsrNode, type SSRContainer } from './types';

export const applyInlineComponent = (component: Component<any>, jsx: JSXNode<Function>) => {
  return component(jsx.props, jsx.key, jsx.flags);
};

export const applyQwikComponentHost = (
  jsx: JSXNode,
  component: Component<any>,
  ssr: SSRContainer
) => {
  return component(jsx.props, jsx.key, jsx.flags);
};

export const applyQwikComponentBody = (jsx: JSXNode, ssr: SSRContainer) => {
  const hostElement = ssr.getLastNode();
  const containerState: ContainerState = createContainerState(
    new SsrNode(SsrNode.ELEMENT_NODE, '', EMPTY_ARRAY) as any,
    '/test/'
  );
  const rCtx: RenderContext = createRenderContext(null!, containerState);
  const elCtx: QContext = createContext(hostElement as any);
  const props = jsx.props.props;
  hostElement.setAttribute(ELEMENT_PROPS, String(ssr.addRoot(props)));
  const componentQRL = jsx.props[OnRenderProp];
  hostElement.setAttribute(OnRenderProp, String(ssr.addRoot(componentQRL)));

  elCtx.$props$ = jsx.props.props as any;
  elCtx.$componentQrl$ = jsx.props[OnRenderProp] as any;
  return maybeThen(executeComponent(rCtx, elCtx), (v) => {
    if (elCtx.$seq$) {
      hostElement.setAttribute(ELEMENT_SEQ, String(ssr.addRoot(elCtx.$seq$)));
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
