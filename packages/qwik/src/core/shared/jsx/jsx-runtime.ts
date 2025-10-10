import { _jsxSplit, Virtual } from './jsx-internal';
import { JSXNodeImpl } from './jsx-node';
import type { FunctionComponent, JSXNode } from './types/jsx-node';

export type { QwikJSX as JSX } from './types/jsx-qwik';

export type Props = Record<string, unknown>;

/**
 * Used by the JSX transpilers to create a JSXNode. Note that the optimizer will normally not use
 * this, instead using _jsxSplit and _jsxSorted directly.
 *
 * The optimizer will also replace all `jsx()` calls with the more optimized versions.
 *
 * The exception is when the props are not a literal object, which can only happen when the `jsx`
 * call is written directly.
 *
 * @public
 */
export const jsx = <T extends string | FunctionComponent<any>>(
  type: T,
  props: T extends FunctionComponent<infer PROPS> ? PROPS : Props,
  key?: string | number | null,
  _isStatic?: boolean,
  dev?: JsxDevOpts
): JSXNode<T> => {
  return _jsxSplit(type, props, null, null, 0, key, dev);
};

interface JsxDevOpts {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

/**
 * Alias of `jsx` for development purposes.
 *
 * @public
 */
export const jsxDEV = jsx;
/**
 * Alias of `jsx` to support JSX syntax.
 *
 * @public
 */
export const jsxs = jsx;

/**
 * The legacy transform, used by some JSX transpilers. The optimizer normally replaces this with
 * optimized calls, with the same caveat as `jsx()`.
 *
 * @public
 */
export function h<TYPE extends string | FunctionComponent<PROPS>, PROPS extends {} = {}>(
  type: TYPE,
  props?: PROPS | null,
  ...children: any[]
): JSXNode<TYPE> {
  const normalizedProps: any = {
    children: arguments.length > 2 ? children.flat(100) : null,
  };

  let key: any = null;

  for (const i in props) {
    if (i == 'key') {
      key = (props as Record<string, any>)[i];
    } else {
      normalizedProps[i] = (props as Record<string, any>)[i];
    }
  }

  if (typeof type === 'string' && !key && 'dangerouslySetInnerHTML' in normalizedProps) {
    key = 'innerhtml';
  }
  return _jsxSplit(type, props!, null, normalizedProps.children, 0, key);
}

/** @public */
export const Fragment: FunctionComponent<{ children?: any; key?: string | number | null }> = (
  props
) => props.children;

/** @public */
export const RenderOnce: FunctionComponent<{
  children?: unknown;
  key?: string | number | null | undefined;
}> = (props: any, key) => {
  return new JSXNodeImpl(Virtual, null, null, props.children, key);
};
