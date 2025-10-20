import { untrack } from '../../use/use-core';
import type { OnRenderFn } from '../component.public';
import type { QRLInternal } from '../qrl/qrl-class';
import type { OnRenderProp, QSlot, QSlotS, QScopedStyle, ELEMENT_ID } from '../utils/markers';
import { JSXNodeImpl } from './jsx-node';
import { type Props, jsx } from './jsx-runtime';
import type { DevJSX, JSXNodeInternal, FunctionComponent } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

/**
 * Create a JSXNode with the properties fully split into variable and constant parts, and children
 * separated out. Furthermore, the varProps must be a sorted object, that is, the keys must be
 * sorted in ascending utf-8 value order.
 *
 * The constant parts are expected to be the same on every render, and are not checked for changes.
 * This means that they are constant scalars or refs. When the ref is a signal or a store, it can
 * still update the attribute on the vnode.
 *
 * @param type - The JSX type
 * @param varProps - The properties of the tag, sorted, excluding children, key and any constProps
 * @param constProps - The properties of the tag that are known to be constant references and don't
 *   need checking for changes on re-render
 * @param children - JSX children. Any `children` in the props objects are ignored.
 * @internal
 */

export const _jsxSorted = <T>(
  type: T,
  varProps: Props | null,
  constProps: Props | null,
  children: JSXChildren | null,
  flags: number,
  key: string | number | null | undefined,
  dev?: DevJSX
): JSXNodeInternal<T> => {
  return untrack(() => new JSXNodeImpl(type, varProps, constProps, children, key, false, dev));
};
/**
 * Create a JSXNode, with the properties split into variable and constant parts, but the variable
 * parts could include keys from `constProps`, as well as `key` and `children`.
 *
 * `constProps` cannot include `key` or `children`. The constant parts are expected to be the same
 * on every render, and are not checked for changes. This means that they are constant scalars or
 * refs. When the ref is a signal or a store, it can still update the attribute on the vnode.
 *
 * If `children` or `key` are defined, any `children`/`key` in the props will be ignored.
 *
 * @param type - The tag type
 * @param varProps - The properties of the tag that could change, including children
 * @param constProps - The properties of the tag that are known to be static and don't need checking
 *   for changes on re-render
 * @internal
 */

export const _jsxSplit = <T extends string | FunctionComponent<any>>(
  type: T,
  varProps: Props | null,
  constProps: Props | null,
  children: JSXChildren | null | undefined,
  flags: number,
  key?: string | number | null,
  dev?: DevJSX
): JSXNodeInternal<T> => {
  return untrack(() => {
    if (varProps) {
      for (const k in varProps) {
        if (k === 'children') {
          children ||= varProps.children as JSXChildren;
          varProps.children = undefined;
        } else if (k === 'key') {
          key ||= varProps.key as string;
          varProps.key = undefined;
        } else if (constProps && k in constProps) {
          varProps[k] = undefined;
        }
      }
    }
    return new JSXNodeImpl(type, varProps, constProps, children, key, true, dev);
  });
};
/** @internal @deprecated v1 compat */

export const _jsxC = (type: any, mutable: any, _flags: any, key: any) => jsx(type, mutable, key);
/** @internal @deprecated v1 compat */
export const _jsxS = (type: any, mutable: any, immutable: any, _flags: any, key: any) =>
  jsx(type, { ...immutable, ...mutable }, key);
/** @internal @deprecated v1 compat */
export const _jsxQ = (
  type: any,
  mutable: any,
  immutable: any,
  children: any,
  _flags: any,
  key: any
) => jsx(type, { ...immutable, ...mutable, children }, key); /** @private */

export const Virtual: FunctionComponent<{
  children?: JSXChildren;
  dangerouslySetInnerHTML?: string;
  [OnRenderProp]?: QRLInternal<OnRenderFn<any>>;
  [QSlot]?: string;
  [QSlotS]?: string;
  props?: Props;
  [QScopedStyle]?: string;
  [ELEMENT_ID]?: string;
}> = (props: any) => props.children;
