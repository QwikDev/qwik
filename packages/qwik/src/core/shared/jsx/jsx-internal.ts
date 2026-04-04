import type { OnRenderFn } from '../component.public';
import { createQRL } from '../qrl/qrl-class';
import type { QRLInternal } from '../qrl/qrl-class';
import { jsxEventToHtmlAttribute, normalizeJsxEventName } from '../utils/event-names';
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
const PASSIVE = 'passive:';
const PREVENT_DEFAULT = 'preventdefault:';
const _hasOwnProperty = Object.prototype.hasOwnProperty;

const removePassiveMarkers = (
  props: Props,
  passiveKeys: string[],
  preventDefaultKeys: string[],
  passiveEvents: Set<string>,
  canMutate = false
): Props => {
  let mutableProps = props;
  let copied = canMutate;

  if (passiveKeys.length > 0) {
    if (!copied) {
      mutableProps = { ...mutableProps };
      copied = true;
    }
    for (const k of passiveKeys) {
      delete mutableProps[k];
    }
  }

  if (preventDefaultKeys.length > 0) {
    for (const k of preventDefaultKeys) {
      if (passiveEvents.has(normalizeJsxEventName(k.slice(PREVENT_DEFAULT.length)))) {
        if (!copied) {
          mutableProps = { ...mutableProps };
          copied = true;
        }
        delete mutableProps[k];
      }
    }
  }

  return mutableProps;
};

const getPassiveEventKey = (key: string): string | null => {
  if (key.startsWith('on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(2, -1));
  }
  if (key.startsWith('window:on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(9, -1));
  }
  if (key.startsWith('document:on') && key.endsWith('$')) {
    return normalizeJsxEventName(key.slice(11, -1));
  }
  return null;
};

const convertJsxEventProps = (
  props: Props,
  eventKeys: string[],
  keyOrder: Map<string, number>,
  passiveEvents: Set<string>,
  canMutate = false
): Props => {
  let mutableProps = props;
  let copied = canMutate;

  for (const k of eventKeys) {
    const passiveEventKey = getPassiveEventKey(k)!;
    const attr = jsxEventToHtmlAttribute(k, passiveEvents.has(passiveEventKey));
    if (attr) {
      if (!copied) {
        mutableProps = { ...mutableProps };
        copied = true;
      }
      const attrIndex = keyOrder.get(attr);
      if (attrIndex === undefined || attrIndex < keyOrder.get(k)!) {
        mutableProps[attr] = mutableProps[k];
      }
      delete mutableProps[k];
    }
  }

  return mutableProps;
};

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
  // TODO use this to know static parts of the tree
  flags: number,
  key: string | number | null | undefined,
  dev?: DevJSX
): JSXNodeInternal<T> => {
  return new JSXNodeImpl(type, varProps, constProps, children, flags, key, false, dev);
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
    const passiveEvents = new Set<string>();
    const constEventKeys: string[] = [];
    const varEventKeys: string[] = [];
    const constPassiveKeys: string[] = [];
    const varPassiveKeys: string[] = [];
    const constPreventDefaultKeys: string[] = [];
    const varPreventDefaultKeys: string[] = [];
    const constKeyOrder = new Map<string, number>();
    const varKeyOrder = new Map<string, number>();

    if (constProps) {
      let index = 0;
      for (const k in constProps) {
        constKeyOrder.set(k, index++);
        if (k.startsWith(PASSIVE)) {
          constPassiveKeys.push(k);
          passiveEvents.add(normalizeJsxEventName(k.slice(PASSIVE.length)));
        } else if (k.startsWith(PREVENT_DEFAULT)) {
          constPreventDefaultKeys.push(k);
        } else if (getPassiveEventKey(k) !== null) {
          constEventKeys.push(k);
        } else if (k === BIND_CHECKED) {
          // Set flag, will process after walk
          bindCheckedSignal = constProps[k];
        } else if (k === BIND_VALUE) {
          // Set flag, will process after walk
          bindValueSignal = constProps[k];
        }
      }
    }
    if (varProps) {
      let index = 0;
      for (const k in varProps) {
        varKeyOrder.set(k, index++);
        if (k.startsWith(PASSIVE)) {
          varPassiveKeys.push(k);
          passiveEvents.add(normalizeJsxEventName(k.slice(PASSIVE.length)));
        } else if (k.startsWith(PREVENT_DEFAULT)) {
          varPreventDefaultKeys.push(k);
        } else if (getPassiveEventKey(k) !== null) {
          varEventKeys.push(k);
        } else if (k === BIND_CHECKED) {
          // Set flag, will process after walk
          bindCheckedSignal = varProps[k];
        } else if (k === BIND_VALUE) {
          // Set flag, will process after walk
          bindValueSignal = varProps[k];
        }
      }
    }

    if (constProps) {
      const originalConstProps = constProps;
      constProps = removePassiveMarkers(
        constProps,
        constPassiveKeys,
        constPreventDefaultKeys,
        passiveEvents,
        constPropsCopied
      );
      constPropsCopied = constPropsCopied || constProps !== originalConstProps;
      constProps = convertJsxEventProps(
        constProps,
        constEventKeys,
        constKeyOrder,
        passiveEvents,
        constPropsCopied
      );
      constPropsCopied = constPropsCopied || constProps !== originalConstProps;
    }

    if (varProps) {
      const originalVarProps = varProps;
      varProps = removePassiveMarkers(
        varProps,
        varPassiveKeys,
        varPreventDefaultKeys,
        passiveEvents,
        varPropsCopied
      );
      varPropsCopied = varPropsCopied || varProps !== originalVarProps;
      varProps = convertJsxEventProps(
        varProps,
        varEventKeys,
        varKeyOrder,
        passiveEvents,
        varPropsCopied
      );
      varPropsCopied = varPropsCopied || varProps !== originalVarProps;
      toSort = toSort || varEventKeys.length > 0;
    }

    // Handle bind:* - only in varProps, bind:* should be moved to varProps
    if (bindCheckedSignal || bindValueSignal) {
      if (!varPropsCopied) {
        varProps = { ...varProps };
        varPropsCopied = true;
      }

      varProps ||= {};

      if (bindCheckedSignal) {
        // Delete from both varProps and constProps if present
        if (varProps && _hasOwnProperty.call(varProps, BIND_CHECKED)) {
          delete varProps[BIND_CHECKED];
        }
        if (constProps && _hasOwnProperty.call(constProps, BIND_CHECKED)) {
          if (!constPropsCopied) {
            constProps = { ...constProps };
            constPropsCopied = true;
          }
          delete constProps[BIND_CHECKED];
        }
        varProps.checked = bindCheckedSignal;
        const handler = createQRL(null, '_chk', _chk, null, [bindCheckedSignal]);

        // Move q-e:input from constProps if it exists
        if (constProps && _hasOwnProperty.call(constProps, 'q-e:input')) {
          if (!constPropsCopied) {
            constProps = { ...constProps };
            constPropsCopied = true;
          }
          const existingHandler = constProps['q-e:input'];
          delete constProps['q-e:input'];
          toSort = mergeHandlers(varProps, 'q-e:input', existingHandler as any) || toSort;
        }

        toSort = mergeHandlers(varProps, 'q-e:input', handler) || toSort;
      } else if (bindValueSignal) {
        // Delete from both varProps and constProps if present
        if (varProps && _hasOwnProperty.call(varProps, BIND_VALUE)) {
          delete varProps[BIND_VALUE];
        }
        if (constProps && _hasOwnProperty.call(constProps, BIND_VALUE)) {
          if (!constPropsCopied) {
            constProps = { ...constProps };
            constPropsCopied = true;
          }
          delete constProps[BIND_VALUE];
        }
        varProps.value = bindValueSignal;
        const handler = createQRL(null, '_val', _val, null, [bindValueSignal]);

        // Move q-e:input from constProps if it exists
        if (constProps && _hasOwnProperty.call(constProps, 'q-e:input')) {
          if (!constPropsCopied) {
            constProps = { ...constProps };
            constPropsCopied = true;
          }
          const existingHandler = constProps['q-e:input'];
          delete constProps['q-e:input'];
          toSort = mergeHandlers(varProps, 'q-e:input', existingHandler as any) || toSort;
        }

        toSort = mergeHandlers(varProps, 'q-e:input', handler) || toSort;
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
  return new JSXNodeImpl(type, varProps, constProps, children, flags, key, toSort || true, dev);
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
