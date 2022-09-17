import { qError, QError_invalidJsxNodeType } from '../../error/error';
import { InvokeContext, newInvokeContext, invoke } from '../../use/use-core';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../../util/flyweight';
import { logWarn } from '../../util/log';
import { QScopedStyle } from '../../util/markers';
import { isNotNullable, isPromise, promiseAll, then } from '../../util/promises';
import { qDev, qSerialize, seal } from '../../util/qdev';
import { isArray, isFunction, isObject, isString, ValueOrPromise } from '../../util/types';
import { domToVnode, visitJsxNode } from './visitor';
import { SkipRender, Virtual } from '../jsx/utils.public';
import { isJSXNode, SKIP_RENDER_TYPE } from '../jsx/jsx-runtime';
import type { JSXNode } from '../jsx/types/jsx-node';
import { executeComponent } from '../execute-component';
import type { RenderContext } from '../types';
import { serializeSStyle } from '../../component/qrl-styles';
import type { QContext } from '../../props/props';
import { QwikElement, VIRTUAL, VirtualElement } from './virtual-element';
import { appendHeadStyle } from './operations';

export const renderComponent = (
  rctx: RenderContext,
  ctx: QContext,
  flags: number
): ValueOrPromise<void> => {
  const justMounted = !ctx.$mounted$;
  const hostElement = ctx.$element$;
  const containerState = rctx.$static$.$containerState$;
  // Component is not dirty any more
  containerState.$hostsStaging$.delete(hostElement);
  // Clean current subscription before render
  containerState.$subsManager$.$clearSub$(hostElement);

  // TODO, serialize scopeIds
  return then(executeComponent(rctx, ctx), (res) => {
    const staticCtx = rctx.$static$;
    const newCtx = res.rctx;
    const invocatinContext = newInvokeContext(hostElement);
    staticCtx.$hostElements$.add(hostElement);
    invocatinContext.$subscriber$ = hostElement;
    invocatinContext.$renderCtx$ = newCtx;
    if (justMounted) {
      if (ctx.$appendStyles$) {
        for (const style of ctx.$appendStyles$) {
          appendHeadStyle(staticCtx, style);
        }
      }
      if (qSerialize && ctx.$scopeIds$) {
        const value = serializeSStyle(ctx.$scopeIds$);
        if (value) {
          hostElement.setAttribute(QScopedStyle, value);
        }
      }
    }
    const processedJSXNode = processData(res.node, invocatinContext);
    return then(processedJSXNode, (processedJSXNode) => {
      const newVdom = wrapJSX(hostElement, processedJSXNode);
      const oldVdom = getVdom(ctx);
      return then(visitJsxNode(newCtx, oldVdom, newVdom, flags), () => {
        ctx.$vdom$ = newVdom;
      });
    });
  });
};

export const getVdom = (ctx: QContext) => {
  if (!ctx.$vdom$) {
    ctx.$vdom$ = domToVnode(ctx.$element$);
  }
  return ctx.$vdom$;
};

export class ProcessedJSXNodeImpl implements ProcessedJSXNode {
  $elm$: Node | VirtualElement | null = null;
  $text$: string = '';

  constructor(
    public $type$: string,
    public $props$: Record<string, any>,
    public $children$: ProcessedJSXNode[],
    public $key$: string | null
  ) {
    seal(this);
  }
}

export const processNode = (
  node: JSXNode,
  invocationContext?: InvokeContext
): ValueOrPromise<ProcessedJSXNode | ProcessedJSXNode[] | undefined> => {
  const key = node.key != null ? String(node.key) : null;
  const nodeType = node.type;
  const props = node.props;
  const originalChildren = props.children;
  let textType = '';
  if (isString(nodeType)) {
    textType = nodeType;
  } else if (nodeType === Virtual) {
    textType = VIRTUAL;
  } else if (isFunction(nodeType)) {
    const res = invoke(invocationContext, nodeType, props, node.key);
    return processData(res, invocationContext);
  } else {
    throw qError(QError_invalidJsxNodeType, nodeType);
  }
  let children: ProcessedJSXNode[] = EMPTY_ARRAY;
  if (originalChildren != null) {
    return then(processData(originalChildren, invocationContext), (result) => {
      if (result !== undefined) {
        children = isArray(result) ? result : [result];
      }
      return new ProcessedJSXNodeImpl(textType, props, children, key);
    });
  } else {
    return new ProcessedJSXNodeImpl(textType, props, children, key);
  }
};

export const wrapJSX = (
  element: QwikElement,
  input: ProcessedJSXNode[] | ProcessedJSXNode | undefined
) => {
  const children = input === undefined ? EMPTY_ARRAY : isArray(input) ? input : [input];
  const node = new ProcessedJSXNodeImpl(':virtual', {}, children, null);
  node.$elm$ = element;
  return node;
};

export const processData = (
  node: any,
  invocationContext?: InvokeContext
): ValueOrPromise<ProcessedJSXNode[] | ProcessedJSXNode | undefined> => {
  if (node == null || typeof node === 'boolean') {
    return undefined;
  }
  if (isString(node) || typeof node === 'number') {
    const newNode = new ProcessedJSXNodeImpl('#text', EMPTY_OBJ, EMPTY_ARRAY, null);
    newNode.$text$ = String(node);
    return newNode;
  } else if (isJSXNode(node)) {
    return processNode(node, invocationContext);
  } else if (isArray(node)) {
    const output = promiseAll(node.flatMap((n) => processData(n, invocationContext)));
    return then(output, (array) => array.flat(100).filter(isNotNullable));
  } else if (isPromise(node)) {
    return node.then((node) => processData(node, invocationContext));
  } else if (node === SkipRender) {
    return new ProcessedJSXNodeImpl(SKIP_RENDER_TYPE, EMPTY_OBJ, EMPTY_ARRAY, null);
  } else {
    logWarn('A unsupported value was passed to the JSX, skipping render. Value:', node);
    return undefined;
  }
};

export const isProcessedJSXNode = (n: any): n is ProcessedJSXNode => {
  if (qDev) {
    if (n instanceof ProcessedJSXNodeImpl) {
      return true;
    }
    if (isObject(n) && n.constructor.name === ProcessedJSXNodeImpl.name) {
      throw new Error(`Duplicate implementations of "ProcessedJSXNodeImpl" found`);
    }
    return false;
  } else {
    return n instanceof ProcessedJSXNodeImpl;
  }
};

export interface ProcessedJSXNode {
  $type$: string;
  $props$: Record<string, any>;
  $children$: ProcessedJSXNode[];
  $key$: string | null;
  $elm$: Node | VirtualElement | null;
  $text$: string;
}
