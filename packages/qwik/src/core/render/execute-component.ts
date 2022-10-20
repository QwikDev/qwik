import { assertDefined } from '../error/assert';
import { RenderEvent } from '../util/markers';
import { safeCall } from '../util/promises';
import { newInvokeContext } from '../use/use-core';
import { isArray, isObject, isString, ValueOrPromise } from '../util/types';
import type { JSXNode } from './jsx/types/jsx-node';
import type { RenderContext } from './types';
import { ContainerState, intToStr } from '../container/container';
import { fromCamelToKebabCase } from '../util/case';
import { qError, QError_stringifyClassOrStyle } from '../error/error';
import { seal } from '../util/qdev';
import { EMPTY_ARRAY } from '../util/flyweight';
import { SkipRender } from './jsx/utils.public';
import { handleError } from './error-handling';
import { HOST_FLAG_DIRTY, HOST_FLAG_MOUNTED, QContext } from '../state/context';

export interface ExecuteComponentOutput {
  node: JSXNode | null;
  rCtx: RenderContext;
}

export const executeComponent = (
  rCtx: RenderContext,
  elCtx: QContext
): ValueOrPromise<ExecuteComponentOutput> => {
  elCtx.$flags$ &= ~HOST_FLAG_DIRTY;
  elCtx.$flags$ |= HOST_FLAG_MOUNTED;
  elCtx.$slots$ = [];
  elCtx.li.length = 0;

  const hostElement = elCtx.$element$;
  const componentQRL = elCtx.$componentQrl$;
  const props = elCtx.$props$;
  const newCtx = pushRenderContext(rCtx, elCtx);
  const invocatinContext = newInvokeContext(hostElement, undefined, RenderEvent);
  const waitOn = (invocatinContext.$waitOn$ = []);
  assertDefined(componentQRL, `render: host element to render must has a $renderQrl$:`, elCtx);
  assertDefined(props, `render: host element to render must has defined props`, elCtx);

  // Set component context
  newCtx.$cmpCtx$ = elCtx;

  // Invoke render hook
  invocatinContext.$subscriber$ = hostElement;
  invocatinContext.$renderCtx$ = rCtx;

  // Resolve render function
  componentQRL.$setContainer$(rCtx.$static$.$containerState$.$containerEl$);
  const componentFn = componentQRL.getFn(invocatinContext);

  return safeCall(
    () => componentFn(props),
    (jsxNode) => {
      if (waitOn.length > 0) {
        return Promise.all(waitOn).then(() => {
          if (elCtx.$flags$ & HOST_FLAG_DIRTY) {
            return executeComponent(rCtx, elCtx);
          }
          return {
            node: jsxNode,
            rCtx: newCtx,
          };
        });
      }
      if (elCtx.$flags$ & HOST_FLAG_DIRTY) {
        return executeComponent(rCtx, elCtx);
      }
      return {
        node: jsxNode,
        rCtx: newCtx,
      };
    },
    (err) => {
      handleError(err, hostElement, rCtx);
      return {
        node: SkipRender,
        rCtx: newCtx,
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

export const setQId = (rCtx: RenderContext, elCtx: QContext) => {
  const id = getNextIndex(rCtx);
  elCtx.$id$ = id;
};

export const hasStyle = (containerState: ContainerState, styleId: string) => {
  return containerState.$styleIds$.has(styleId);
};

export const jsxToString = (data: any) => {
  return data == null || typeof data === 'boolean' ? '' : String(data);
};
