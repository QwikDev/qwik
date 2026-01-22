import type { OnRenderFn } from '../component.public';
import { createQRL } from '../qrl/qrl-class';
import type { QRLInternal } from '../qrl/qrl-class';
import { jsxEventToHtmlAttribute } from '../utils/event-names';
import { logOnceWarn } from '../utils/log';
import type { OnRenderProp, QSlot, QSlotS, QScopedStyle, ELEMENT_ID } from '../utils/markers';
import { qDev } from '../utils/qdev';
import { _chk, _val } from './bind-handlers';
import { JSXNodeImpl, mergeHandlers } from './jsx-node';
import { type Props, jsx } from './jsx-runtime';
import type { DevJSX, JSXNodeInternal, FunctionComponent } from './types/jsx-node';
import type { JSXChildren } from './types/jsx-qwik-attributes';

const BIND_VALUE = 'bind:value';
const BIND_CHECKED = 'bind:checked';
const _hasOwnProperty = Object.prototype.hasOwnProperty;

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
  return new JSXNodeImpl(type, varProps, constProps, children, key, false, dev);
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
  let toSort = false;
  let constPropsCopied = false;
  let varPropsCopied = false;
  let bindValueSignal: any = null;
  let bindCheckedSignal: any = null;

  // Apply transformations for native HTML elements only
  if (typeof type === 'string') {
    // Transform event names (onClick$ -> on:click)
    if (constProps) {
      const processedKeys = new Set<string>();
      for (const k in constProps) {
        const attr = jsxEventToHtmlAttribute(k);
        if (attr) {
          if (!constPropsCopied) {
            constProps = { ...constProps };
            constPropsCopied = true;
          }
          if (!_hasOwnProperty.call(constProps, attr) || processedKeys.has(attr)) {
            constProps[attr] = constProps[k];
          }
          delete constProps[k];
        }
        processedKeys.add(k);
      }
    }
    if (varProps) {
      const processedKeys = new Set<string>();
      for (const k in varProps) {
        const attr = jsxEventToHtmlAttribute(k);
        if (attr) {
          if (!varPropsCopied) {
            varProps = { ...varProps };
            varPropsCopied = true;
          }
          // Transform event name in place
          if (!_hasOwnProperty.call(varProps, attr) || processedKeys.has(attr)) {
            varProps[attr] = varProps[k];
          }
          delete varProps[k];
          toSort = true;
        } else if (k === BIND_CHECKED) {
          // Set flag, will process after walk
          bindCheckedSignal = varProps[k];
        } else if (k === BIND_VALUE) {
          // Set flag, will process after walk
          bindValueSignal = varProps[k];
        }
        processedKeys.add(k);
      }

      // Handle bind:* - only in varProps, bind:* should be moved to varProps
      if (bindCheckedSignal || bindValueSignal) {
        if (!varPropsCopied) {
          varProps = { ...varProps };
          varPropsCopied = true;
        }

        if (bindCheckedSignal) {
          delete varProps[BIND_CHECKED];
          varProps.checked = bindCheckedSignal;
          const handler = createQRL(null, '_chk', _chk, null, null, [bindCheckedSignal]);

          // Move on:input from constProps if it exists
          if (constProps && _hasOwnProperty.call(constProps, 'on:input')) {
            if (!constPropsCopied) {
              constProps = { ...constProps };
              constPropsCopied = true;
            }
            const existingHandler = constProps['on:input'];
            delete constProps['on:input'];
            toSort = mergeHandlers(varProps, 'on:input', existingHandler as any) || toSort;
          }

          toSort = mergeHandlers(varProps, 'on:input', handler) || toSort;
        } else if (bindValueSignal) {
          delete varProps[BIND_VALUE];
          varProps.value = bindValueSignal;
          const handler = createQRL(null, '_val', _val, null, null, [bindValueSignal]);

          // Move on:input from constProps if it exists
          if (constProps && _hasOwnProperty.call(constProps, 'on:input')) {
            if (!constPropsCopied) {
              constProps = { ...constProps };
              constPropsCopied = true;
            }
            const existingHandler = constProps['on:input'];
            delete constProps['on:input'];
            toSort = mergeHandlers(varProps, 'on:input', existingHandler as any) || toSort;
          }

          toSort = mergeHandlers(varProps, 'on:input', handler) || toSort;
        }
      }
    }

    // Transform className -> class
    if (varProps && _hasOwnProperty.call(varProps, 'className')) {
      if (!varPropsCopied) {
        varProps = { ...varProps };
        varPropsCopied = true;
      }
      varProps.class = varProps.className;
      varProps.className = undefined;
      toSort = true;
      if (qDev) {
        logOnceWarn(
          `jsx${
            dev ? ` ${dev.fileName}${dev?.lineNumber ? `:${dev.lineNumber}` : ''}` : ''
          }: \`className\` is deprecated. Use \`class\` instead.`
        );
      }
    }
    if (constProps && _hasOwnProperty.call(constProps, 'className')) {
      if (!constPropsCopied) {
        constProps = { ...constProps };
        constPropsCopied = true;
      }
      constProps.class = constProps.className;
      constProps.className = undefined;
      if (qDev) {
        logOnceWarn(
          `jsx${
            dev ? ` ${dev.fileName}${dev?.lineNumber ? `:${dev.lineNumber}` : ''}` : ''
          }: \`className\` is deprecated. Use \`class\` instead.`
        );
      }
    }
  }

  if (varProps) {
    for (const k in varProps) {
      if (k === 'children') {
        if (!varPropsCopied) {
          varProps = { ...varProps };
          varPropsCopied = true;
        }
        children ||= varProps.children as JSXChildren;
        delete varProps.children;
      } else if (k === 'key') {
        if (!varPropsCopied) {
          varProps = { ...varProps };
          varPropsCopied = true;
        }
        key ||= varProps.key as string;
        delete varProps.key;
      } else if (constProps && k in constProps) {
        if (!varPropsCopied) {
          varProps = { ...varProps };
          varPropsCopied = true;
        }
        delete varProps[k];
      } else if (varProps[k] === null) {
        if (!varPropsCopied) {
          varProps = { ...varProps };
          varPropsCopied = true;
        }
        // Clean up null markers (from event conversions)
        delete varProps[k];
      }
    }
  }
  return new JSXNodeImpl(type, varProps, constProps, children, key, toSort || true, dev);
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
