import { assertDefined } from '../assert/assert';
import {
  ComponentStylesPrefixContent,
  ELEMENT_ID,
  OnRenderProp,
  QSlot,
  RenderEvent,
} from '../util/markers';
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
import { directSetAttribute } from './fast-calls';
import type { QwikElement } from './dom/virtual-element';

export interface ExecuteComponentOutput {
  node: JSXNode | null;
  rctx: RenderContext;
}

export const executeComponent = (
  rctx: RenderContext,
  ctx: QContext
): ValueOrPromise<ExecuteComponentOutput | void> => {
  ctx.$dirty$ = false;
  ctx.$mounted$ = true;

  const hostElement = ctx.$element$;
  const onRenderQRL = ctx.$renderQrl$!;
  assertDefined(onRenderQRL, `render: host element to render must has a $renderQrl$:`, ctx);

  const props = ctx.$props$;
  assertDefined(props, `render: host element to render must has defined props`, ctx);

  // Component is not dirty any more
  rctx.$containerState$.$hostsStaging$.delete(hostElement);

  const newCtx = copyRenderContext(rctx);

  // Invoke render hook
  const invocatinContext = newInvokeContext(rctx.$doc$, hostElement, undefined, RenderEvent);
  invocatinContext.$subscriber$ = hostElement;
  invocatinContext.$renderCtx$ = newCtx;
  const waitOn = (invocatinContext.$waitOn$ = [] as any[]);

  // Clean current subscription before render
  rctx.$containerState$.$subsManager$.$clearSub$(hostElement);

  // Resolve render function
  const onRenderFn = onRenderQRL.$invokeFn$(rctx.$containerEl$, invocatinContext);

  return safeCall(
    () => onRenderFn(props) as JSXNode | Function,
    (jsxNode) => {
      rctx.$hostElements$.add(hostElement);
      const waitOnPromise = promiseAll(waitOn);
      return then(waitOnPromise, () => {
        if (isFunction(jsxNode)) {
          ctx.$dirty$ = false;
          jsxNode = jsxNode();
        } else if (ctx.$dirty$) {
          return executeComponent(rctx, ctx);
        }

        let componentCtx = ctx.$component$;
        if (!componentCtx) {
          componentCtx = ctx.$component$ = {
            $ctx$: ctx,
            $slots$: [],
            $attachedListeners$: false,
          };
        }
        componentCtx.$attachedListeners$ = false;
        componentCtx.$slots$ = [];
        newCtx.$localStack$.push(ctx);
        newCtx.$currentComponent$ = componentCtx;
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
    $doc$: doc,
    $containerState$: containerState,
    $containerEl$: containerState.$containerEl$,
    $hostElements$: new Set(),
    $operations$: [],
    $postOperations$: [],
    $roots$: [],
    $localStack$: [],
    $currentComponent$: undefined,
    $perf$: {
      $visited$: 0,
    },
  };
  return ctx;
};

export const copyRenderContext = (ctx: RenderContext): RenderContext => {
  const newCtx: RenderContext = {
    ...ctx,
    $localStack$: [...ctx.$localStack$],
  };
  return newCtx;
};

export const stringifyClass = (obj: any, oldValue: string | undefined): string => {
  const oldParsed = parseClassAny(oldValue);
  const newParsed = parseClassAny(obj);
  return [...oldParsed.filter((s) => s.includes(ComponentStylesPrefixContent)), ...newParsed].join(
    ' '
  );
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
  return intToStr(ctx.$containerState$.$elementIndex$++);
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
  directSetAttribute(ctx.$element$, ELEMENT_ID, id);
};

export const hasStyle = (containerState: ContainerState, styleId: string) => {
  return containerState.$styleIds$.has(styleId);
};

export const ALLOWS_PROPS = [QSlot];
export const SKIPS_PROPS = [QSlot, OnRenderProp, 'children'];
