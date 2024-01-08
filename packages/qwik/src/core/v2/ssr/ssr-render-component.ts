import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { Component } from '../../component/component.public';
import { createContainerState, type ContainerState } from '../../container/container';
import { serializeComponentContext } from '../../container/pause';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import { createRenderContext, executeComponent } from '../../render/execute-component';
import type { RenderContext } from '../../render/types';
import { createContext, type QContext } from '../../state/context';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { ELEMENT_ID } from '../../util/markers';
import { maybeThen } from '../../util/promises';
import { SsrNode, type SSRContainer } from './types';

export const applyInlineComponent = (component: Function, jsx: JSXNode<Function>): JSXNode => {
  return component(jsx.props);
};

export const applyQwikComponent = (jsx: JSXNode, component: Component<any>, ssr: SSRContainer) => {
  const hostElement = ssr.getLastNode() as any as Element;
  const containerState: ContainerState = createContainerState(
    new SsrNode(SsrNode.ELEMENT_NODE, '', EMPTY_ARRAY) as any,
    '/test/'
  );
  const rCtx: RenderContext = createRenderContext(null!, containerState);
  const elCtx: QContext = createContext(hostElement);
  elCtx.$props$ = jsx.props;
  elCtx.$componentQrl$ = (component as any)[SERIALIZABLE_STATE][0];
  return maybeThen(executeComponent(rCtx, elCtx), (v) => {
    // TODO(misko): this should be move to the ssr-render.ts and should only be done once for the whole app.
    const meta = serializeComponentContext(
      elCtx,
      (v) => {
        return String(ssr.serializationCtx.$addRoot$(v));
      },
      (v) => {
        return String(ssr.serializationCtx.$addRoot$(v));
      },
      true,
      true,
      {}
    );
    if (meta) {
      const id = String(ssr.serializationCtx.$addRoot$(meta));
      hostElement.setAttribute(ELEMENT_ID, id);
    }
    return v.node;
  });
};
