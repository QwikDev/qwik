import { assertDefined } from '../assert/assert';
import { ELEMENT_ID, OnRenderProp, QSlot, RenderEvent } from '../util/markers';
import { promiseAll, safeCall, then } from '../util/promises';
import { newInvokeContext } from '../use/use-core';
import { logError } from '../util/log';
import { isArray, isFunction, isObject, isString, ValueOrPromise } from '../util/types';
import { QContext, tryGetContext } from '../props/props';
import type { JSXNode } from './jsx/types/jsx-node';
import type { RenderContext } from './types';
import type { ContainerState } from './container';
import { fromCamelToKebabCase } from '../util/case';
import { qError, QError_stringifyClassOrStyle } from '../error/error';
import { intToStr } from '../object/store';
import type { QwikElement } from './dom/virtual-element';
import { qSerialize, seal } from '../util/qdev';

export interface ExecuteComponentOutput {
  node: JSXNode | null;
  rctx: RenderContext;
}

export const executeComponent = (
  rctx: RenderContext,
  elCtx: QContext
): ValueOrPromise<ExecuteComponentOutput | void> => {
  elCtx.$dirty$ = false;
  elCtx.$mounted$ = true;
  elCtx.$slots$ = [];

  const hostElement = elCtx.$element$;
  const onRenderQRL = elCtx.$renderQrl$!;
  const staticCtx = rctx.$static$;
  const containerState = staticCtx.$containerState$;
  const props = elCtx.$props$;
  const newCtx = pushRenderContext(rctx, elCtx);
  const invocatinContext = newInvokeContext(staticCtx.$doc$, hostElement, undefined, RenderEvent);
  const waitOn = (invocatinContext.$waitOn$ = [] as any[]);
  assertDefined(onRenderQRL, `render: host element to render must has a $renderQrl$:`, elCtx);
  assertDefined(props, `render: host element to render must has defined props`, elCtx);

  // Set component context
  newCtx.$cmpCtx$ = elCtx;

  // Invoke render hook
  invocatinContext.$subscriber$ = hostElement;
  invocatinContext.$renderCtx$ = rctx;

  // Component is not dirty any more
  containerState.$hostsStaging$.delete(hostElement);
  // Clean current subscription before render
  containerState.$subsManager$.$clearSub$(hostElement);

  // Resolve render function
  const onRenderFn = onRenderQRL.getFn(invocatinContext);

  return safeCall(
    () => onRenderFn(props) as JSXNode | Function,
    (jsxNode) => {
      staticCtx.$hostElements$.add(hostElement);
      const waitOnPromise = promiseAll(waitOn);
      return then(waitOnPromise, () => {
        if (isFunction(jsxNode)) {
          elCtx.$dirty$ = false;
          jsxNode = jsxNode();
        } else if (elCtx.$dirty$) {
          return executeComponent(rctx, elCtx);
        }
        elCtx.$attachedListeners$ = false;
        return {
          node: jsxNode as JSXNode,
          rctx: newCtx,
        };
      });
    },
    (err) => {
      logError(err);
    }
  );
};

export const createRenderContext = (
  doc: Document,
  containerState: ContainerState
): RenderContext => {
  const ctx: RenderContext = {
    $static$: {
      $doc$: doc,
      $containerState$: containerState,
      $containerEl$: containerState.$containerEl$,
      $hostElements$: new Set(),
      $operations$: [],
      $postOperations$: [],
      $roots$: [],
      $addSlots$: [],
      $rmSlots$: [],
    },
    $cmpCtx$: undefined,
    $localStack$: [],
  };
  seal(ctx);
  seal(ctx.$static$);
  return ctx;
};

export const pushRenderContext = (ctx: RenderContext, elCtx: QContext): RenderContext => {
  const newCtx: RenderContext = {
    $static$: ctx.$static$,
    $cmpCtx$: ctx.$cmpCtx$,
    $localStack$: ctx.$localStack$.concat(elCtx),
  };
  return newCtx;
};

export const joinClasses = (...input: any[]): string => {
  const set = new Set();
  input.forEach((value) => {
    parseClassAny(value).forEach((v) => set.add(v));
  });
  return Array.from(set).join(' ');
};

export const parseClassAny = (obj: any): string[] => {
  if (isString(obj)) {
    return parseClassList(obj);
  } else if (isObject(obj)) {
    if (isArray(obj)) {
      return obj;
    } else {
      const output: string[] = [];
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value) {
            output.push(key);
          }
        }
      }
      return output;
    }
  }
  return [];
};

const parseClassListRegex = /\s/;
const parseClassList = (value: string | undefined | null): string[] =>
  !value ? [] : value.split(parseClassListRegex);

export const stringifyStyle = (obj: any): string => {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    if (isArray(obj)) {
      throw qError(QError_stringifyClassOrStyle, obj, 'style');
    } else {
      const chunks: string[] = [];
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value) {
            chunks.push(fromCamelToKebabCase(key) + ':' + value);
          }
        }
      }
      return chunks.join(';');
    }
  }
  return String(obj);
};

export const getNextIndex = (ctx: RenderContext) => {
  return intToStr(ctx.$static$.$containerState$.$elementIndex$++);
};

export const getQId = (el: QwikElement): string | null => {
  const ctx = tryGetContext(el);
  if (ctx) {
    return ctx.$id$;
  }
  return null;
};

export const setQId = (rctx: RenderContext, ctx: QContext) => {
  const id = getNextIndex(rctx);
  ctx.$id$ = id;
  if (qSerialize) {
    ctx.$element$.setAttribute(ELEMENT_ID, id);
  }
};

export const hasStyle = (containerState: ContainerState, styleId: string) => {
  return containerState.$styleIds$.has(styleId);
};

export const ALLOWS_PROPS = [QSlot];
export const SKIPS_PROPS = [QSlot, OnRenderProp, 'children'];
