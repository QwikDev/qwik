import { assertDefined } from '../assert/assert';
import { ELEMENT_ID, QSlot, RenderEvent } from '../util/markers';
import { promiseAll, safeCall, then } from '../util/promises';
import { newInvokeContext } from '../use/use-core';
import { logError } from '../util/log';
import { isArray, isFunction, ValueOrPromise } from '../util/types';
import { QContext, tryGetContext } from '../props/props';
import type { JSXNode } from './jsx/types/jsx-node';
import type { RenderContext } from './types';
import type { ContainerState } from './container';
import { fromCamelToKebabCase } from '../util/case';
import { qError, QError_stringifyClassOrStyle } from '../error/error';
import { intToStr } from '../object/store';
import { directSetAttribute } from './fast-calls';

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
  const invocatinContext = newInvokeContext(rctx.$doc$, hostElement, hostElement, RenderEvent);
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
            $hostElement$: hostElement,
            $slots$: [],
            $id$: ctx.$id$,
          };
        }
        componentCtx.$slots$ = [];
        newCtx.$contexts$.push(ctx);
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
    $roots$: [],
    $contexts$: [],
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
    $contexts$: [...ctx.$contexts$],
  };
  return newCtx;
};

export const stringifyClassOrStyle = (obj: any, isClass: boolean): string => {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    let text = '';
    let sep = '';
    if (isArray(obj)) {
      if (!isClass) {
        throw qError(QError_stringifyClassOrStyle, obj, 'style');
      }
      for (let i = 0; i < obj.length; i++) {
        text += sep + obj[i];
        sep = ' ';
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];

          if (value) {
            text += isClass
              ? value
                ? sep + key
                : ''
              : sep + fromCamelToKebabCase(key) + ':' + value;
            sep = isClass ? ' ' : ';';
          }
        }
      }
    }
    return text;
  }
  return String(obj);
};

export const getNextIndex = (ctx: RenderContext) => {
  return intToStr(ctx.$containerState$.$elementIndex$++);
};

export const getQId = (el: Element): string | null => {
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
  return containerState.$stylesIds$.has(styleId);
};

export const ALLOWS_PROPS = ['class', 'className', 'style', 'id', QSlot];
export const HOST_PREFIX = 'host:';
export const SCOPE_PREFIX = /^(host|window|document|prevent(d|D)efault):/;
export const BASE_QWIK_STYLES = `q\\:slot{display:contents}q\\:fallback,q\\:template{display:none}q\\:fallback:last-child{display:contents}`;
