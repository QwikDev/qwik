import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { Component } from '../../core/component/component.public';
import { createContainerState, type ContainerState } from '../../core/container/container';
import { serializeComponentContext } from '../../core/container/pause';
import { SERIALIZABLE_STATE } from '../../core/container/serializers';
import { createRenderContext, executeComponent } from '../../core/render/execute-component';
import type { RenderContext } from '../../core/render/types';
import { createContext, type QContext } from '../../core/state/context';
import { EMPTY_ARRAY } from '../../core/util/flyweight';
import { ELEMENT_ID } from '../../core/util/markers';
import { maybeThen } from '../../core/util/promises';
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
      hostElement.setAttribute(ELEMENT_ID, String(ssr.serializationCtx.$addRoot$(meta)));
    }
    return v.node;
  });
};
