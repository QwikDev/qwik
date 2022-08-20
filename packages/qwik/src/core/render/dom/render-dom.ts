import { qError, QError_invalidJsxNodeType } from '../../error/error';
import { InvokeContext, newInvokeContext, invoke } from '../../use/use-core';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../../util/flyweight';
import { logWarn } from '../../util/log';
import { QScopedStyle } from '../../util/markers';
import { isNotNullable, isPromise, promiseAll, then } from '../../util/promises';
import { qDev } from '../../util/qdev';
import { isArray, isFunction, isObject, isString, ValueOrPromise } from '../../util/types';
import { appendHeadStyle, visitJsxNode } from './visitor';
import { SkipRerender, Virtual } from '../jsx/host.public';
import { isJSXNode, SKIP_RENDER_TYPE, VIRTUAL_TYPE } from '../jsx/jsx-runtime';
import type { JSXNode } from '../jsx/types/jsx-node';
import { executeComponent } from '../execute-component';
import type { RenderContext } from '../types';
import { serializeSStyle } from '../../component/qrl-styles';
import { directSetAttribute } from '../fast-calls';
import type { QContext } from '../../props/props';
import type { VirtualElement } from './virtual-element';

export const renderComponent = (
  rctx: RenderContext,
  ctx: QContext,
  flags: number
): ValueOrPromise<void> => {
  const justMounted = !ctx.$mounted$;

  // TODO, serialize scopeIds
  return then(executeComponent(rctx, ctx), (res) => {
    if (res) {
      const hostElement = ctx.$element$;
      const newCtx = res.rctx;
      const invocatinContext = newInvokeContext(rctx.$doc$, hostElement);
      invocatinContext.$subscriber$ = hostElement;
      invocatinContext.$renderCtx$ = newCtx;
      if (justMounted) {
        if (ctx.$appendStyles$) {
          for (const style of ctx.$appendStyles$) {
            appendHeadStyle(rctx, hostElement, style);
          }
        }
        if (ctx.$scopeIds$) {
          const value = serializeSStyle(ctx.$scopeIds$);
          if (value) {
            directSetAttribute(hostElement, QScopedStyle, value);
          }
        }
      }
      const processedJSXNode = processData(res.node, invocatinContext);
      return then(processedJSXNode, (processedJSXNode) => {
        return visitJsxNode(newCtx, hostElement, processedJSXNode, flags);
      });
    }
  });
};

export class ProcessedJSXNodeImpl implements ProcessedJSXNode {
  $elm$: Element | null = null;
  $text$: string = '';

  constructor(
    public $type$: string,
    public $props$: Record<string, any>,
    public $children$: ProcessedJSXNode[],
    public $key$: string | null
  ) {}
}

export const processNode = (
  node: JSXNode,
  invocationContext?: InvokeContext
): ValueOrPromise<ProcessedJSXNode | ProcessedJSXNode[] | undefined> => {
  const key = node.key != null ? String(node.key) : null;
  let textType = '';
  if (node.type === SkipRerender) {
    textType = SKIP_RENDER_TYPE;
  } else if (node.type === Virtual) {
    textType = VIRTUAL_TYPE;
  } else if (isFunction(node.type)) {
    const res = invocationContext
      ? invoke(invocationContext, () => node.type(node.props, node.key))
      : node.type(node.props, node.key);
    return processData(res, invocationContext);
  } else if (isString(node.type)) {
    textType = node.type;
  } else {
    throw qError(QError_invalidJsxNodeType, node.type);
  }
  let children: ProcessedJSXNode[] = EMPTY_ARRAY;
  if (node.props) {
    const mightPromise = processData(node.props.children, invocationContext);
    return then(mightPromise, (result) => {
      if (result !== undefined) {
        if (isArray(result)) {
          children = result;
        } else {
          children = [result];
        }
      }
      return new ProcessedJSXNodeImpl(textType, node.props, children, key);
    });
  }
  return new ProcessedJSXNodeImpl(textType, node.props, children, key);
};

export const processData = (
  node: any,
  invocationContext?: InvokeContext
): ValueOrPromise<ProcessedJSXNode[] | ProcessedJSXNode | undefined> => {
  if (node == null || typeof node === 'boolean') {
    return undefined;
  }
  if (isJSXNode(node)) {
    return processNode(node, invocationContext);
  } else if (isPromise(node)) {
    return node.then((node) => processData(node, invocationContext));
  } else if (isArray(node)) {
    const output = promiseAll(node.flatMap((n) => processData(n, invocationContext)));
    return then(output, (array) => array.flat(100).filter(isNotNullable));
  } else if (isString(node) || typeof node === 'number') {
    const newNode = new ProcessedJSXNodeImpl('#text', EMPTY_OBJ, EMPTY_ARRAY, null);
    newNode.$text$ = String(node);
    return newNode;
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
