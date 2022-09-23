import { assertDefined } from '../assert/assert';
import { ELEMENT_ID, OnRenderProp, QSlot, RenderEvent } from '../util/markers';
import { safeCall } from '../util/promises';
import { newInvokeContext } from '../use/use-core';
import { isArray, isObject, isString, ValueOrPromise } from '../util/types';
import { QContext, tryGetContext } from '../props/props';
import type { JSXNode } from './jsx/types/jsx-node';
import type { RenderContext } from './types';
import type { ContainerState } from './container';
import { fromCamelToKebabCase } from '../util/case';
import { qError, QError_stringifyClassOrStyle } from '../error/error';
import { intToStr } from '../object/store';
import type { QwikElement } from './dom/virtual-element';
import { qSerialize, seal } from '../util/qdev';
import { EMPTY_ARRAY } from '../util/flyweight';
import { SkipRender } from './jsx/utils.public';
import { handleError } from './error-handling';

export interface ExecuteComponentOutput {
  node: JSXNode | null;
  rctx: RenderContext;
}

export const executeComponent = (
  rctx: RenderContext,
  elCtx: QContext
): ValueOrPromise<ExecuteComponentOutput> => {
  elCtx.$dirty$ = false;
  elCtx.$mounted$ = true;
  elCtx.$slots$ = [];

  const hostElement = elCtx.$element$;
  const componentQRL = elCtx.$componentQrl$;
  const props = elCtx.$props$;
  const newCtx = pushRenderContext(rctx, elCtx);
  const invocatinContext = newInvokeContext(hostElement, undefined, RenderEvent);
  const waitOn = (invocatinContext.$waitOn$ = []);
  assertDefined(componentQRL, `render: host element to render must has a $renderQrl$:`, elCtx);
  assertDefined(props, `render: host element to render must has defined props`, elCtx);

  // Set component context
  newCtx.$cmpCtx$ = elCtx;

  // Invoke render hook
  invocatinContext.$subscriber$ = hostElement;
  invocatinContext.$renderCtx$ = rctx;

  // Resolve render function
  componentQRL.$setContainer$(rctx.$static$.$containerState$.$containerEl$);
  const componentFn = componentQRL.getFn(invocatinContext);

  return safeCall(
    () => componentFn(props),
    (jsxNode) => {
      elCtx.$attachedListeners$ = false;
      if (waitOn.length > 0) {
        return Promise.all(waitOn).then(() => {
          if (elCtx.$dirty$) {
            return executeComponent(rctx, elCtx);
          }
          return {
            node: jsxNode,
            rctx: newCtx,
          };
        });
      }
      if (elCtx.$dirty$) {
        return executeComponent(rctx, elCtx);
      }
      return {
        node: jsxNode,
        rctx: newCtx,
      };
    },
    (err) => {
      handleError(err, hostElement, rctx);
      return {
        node: SkipRender,
        rctx: newCtx,
      };
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

export const serializeClass = (obj: any) => {
  if (isString(obj)) {
    return obj;
  } else if (isObject(obj)) {
    if (isArray(obj)) {
      return obj.join(' ');
    } else {
      let buffer = '';
      let previous = false;
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value) {
          if (previous) {
            buffer += ' ';
          }
          buffer += key;
          previous = true;
        }
      }
      return buffer;
    }
  }
  return '';
};

const parseClassListRegex = /\s/;
export const parseClassList = (value: string | undefined | null): string[] =>
  !value ? EMPTY_ARRAY : value.split(parseClassListRegex);

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

export const SKIPS_PROPS = [QSlot, OnRenderProp, 'children'];
