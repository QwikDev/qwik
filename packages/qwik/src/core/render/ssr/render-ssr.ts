import { isPromise, then } from '../../util/promises';
import { InvokeContext, newInvokeContext, invoke } from '../../use/use-core';
import { createJSXError, isJSXNode, jsx } from '../jsx/jsx-runtime';
import { isArray, isFunction, isString, ValueOrPromise } from '../../util/types';
import type { JSXNode } from '../jsx/types/jsx-node';
import {
  createRenderContext,
  executeComponent,
  getNextIndex,
  isAriaAttribute,
  jsxToString,
  pushRenderContext,
  serializeClass,
  stringifyStyle,
} from '../execute-component';
import { ELEMENT_ID, OnRenderProp, QScopedStyle, QSlot, QSlotS, QStyle } from '../../util/markers';
import { InternalSSRStream, Virtual, SSRRaw, SSRHint } from '../jsx/utils.public';
import { logError, logWarn } from '../../util/log';
import {
  groupListeners,
  isOnProp,
  Listener,
  PREVENT_DEFAULT,
  setEvent,
} from '../../state/listeners';
import { version } from '../../version';
import {
  addQwikEvent,
  ContainerState,
  createContainerState,
  setRef,
} from '../../container/container';
import type { RenderContext } from '../types';
import { assertDefined } from '../../error/assert';
import { serializeSStyle } from '../../style/qrl-styles';
import { qDev, qInspector, seal } from '../../util/qdev';
import { qError, QError_canNotRenderHTML } from '../../error/error';
import { addSignalSub, isSignal, Signal } from '../../state/signal';
import { serializeQRLs } from '../../qrl/qrl';
import type { QwikElement } from '../dom/virtual-element';
import { assertElement } from '../../util/element';
import { EMPTY_OBJ } from '../../util/flyweight';
import {
  createContext,
  HOST_FLAG_DYNAMIC,
  HOST_FLAG_NEED_ATTACH_LISTENER,
  QContext,
  Q_CTX,
} from '../../state/context';
import { createPropsState, createProxy } from '../../state/store';
import { _IMMUTABLE, _IMMUTABLE_PREFIX } from '../../state/constants';

const FLUSH_COMMENT = '<!--qkssr-f-->';

/**
 * @alpha
 */
export type StreamWriter = {
  write: (chunk: string) => void;
};

/**
 * @alpha
 */
export interface RenderSSROptions {
  containerTagName: string;
  containerAttributes: Record<string, string>;
  stream: StreamWriter;
  base?: string;
  envData?: Record<string, any>;
  url?: string;
  beforeContent?: JSXNode<string>[];
  beforeClose?: (
    contexts: QContext[],
    containerState: ContainerState,
    containsDynamic: boolean
  ) => Promise<JSXNode>;
}

export interface SSRContext {
  $projectedCtxs$: [RenderContext, SSRContext] | undefined;
  $projectedChildren$: Record<string, any[] | undefined> | undefined;
  $invocationContext$: InvokeContext | undefined;
  $static$: SSRContextStatic;
}

export interface SSRContextStatic {
  $locale$: string;
  $contexts$: QContext[];
  $dynamic$: boolean;
  $headNodes$: JSXNode<string>[];
}

const IS_HEAD = 1 << 0;
const IS_HTML = 1 << 2;
const IS_TEXT = 1 << 3;
const IS_INVISIBLE = 1 << 4;
const IS_PHASING = 1 << 5;
const IS_ANCHOR = 1 << 6;
const IS_BUTTON = 1 << 7;

const createDocument = () => {
  const doc = { nodeType: 9 };
  seal(doc);
  return doc;
};

/**
 * @alpha
 */
export const renderSSR = async (node: JSXNode, opts: RenderSSROptions) => {
  const root = opts.containerTagName;
  const containerEl = createSSRContext(1).$element$;
  const containerState = createContainerState(containerEl as Element, opts.base ?? '/');
  containerState.$envData$.locale = opts.envData?.locale;
  const doc = createDocument();
  const rCtx = createRenderContext(doc as any, containerState);
  const headNodes = opts.beforeContent ?? [];
  const ssrCtx: SSRContext = {
    $static$: {
      $contexts$: [],
      $dynamic$: false,
      $headNodes$: root === 'html' ? headNodes : [],
      $locale$: opts.envData?.locale,
    },
    $projectedChildren$: undefined,
    $projectedCtxs$: undefined,
    $invocationContext$: undefined,
  };
  seal(ssrCtx);

  const containerAttributes: Record<string, any> = {
    ...opts.containerAttributes,
    'q:container': 'paused',
    'q:version': version ?? 'dev',
    'q:render': qDev ? 'ssr-dev' : 'ssr',
    'q:base': opts.base,
    'q:locale': opts.envData?.locale,
    children: root === 'html' ? [node] : [headNodes, node],
  };
  if (root !== 'html') {
    containerAttributes.class =
      'qc📦' + (containerAttributes.class ? ' ' + containerAttributes.class : '');
  }
  containerState.$envData$ = {
    url: opts.url,
    ...opts.envData,
  };

  node = jsx(root, containerAttributes);
  containerState.$hostsRendering$ = new Set();
  containerState.$renderPromise$ = Promise.resolve().then(() =>
    renderRoot(node, rCtx, ssrCtx, opts.stream, containerState, opts)
  );
  await containerState.$renderPromise$;
};

const renderRoot = async (
  node: JSXNode,
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  containerState: ContainerState,
  opts: RenderSSROptions
) => {
  const beforeClose = opts.beforeClose;

  await renderNode(
    node,
    rCtx,
    ssrCtx,
    stream,
    0,
    beforeClose
      ? (stream: StreamWriter) => {
          const result = beforeClose(
            ssrCtx.$static$.$contexts$,
            containerState,
            ssrCtx.$static$.$dynamic$
          );
          return processData(result, rCtx, ssrCtx, stream, 0, undefined);
        }
      : undefined
  );

  if (qDev) {
    if (ssrCtx.$static$.$headNodes$.length > 0) {
      logError(
        'Missing <head>. Global styles could not be rendered. Please render a <head> element at the root of the app'
      );
    }
  }
  return rCtx;
};

const renderGenerator = async (
  node: JSXNode<typeof InternalSSRStream>,
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number
) => {
  stream.write(FLUSH_COMMENT);
  const generator = node.props.children;
  let value: AsyncGenerator;
  if (isFunction(generator)) {
    const v = generator({
      write(chunk) {
        stream.write(chunk);
        stream.write(FLUSH_COMMENT);
      },
    });
    if (isPromise(v)) {
      return v;
    }
    value = v;
  } else {
    value = generator;
  }
  for await (const chunk of value) {
    await processData(chunk, rCtx, ssrCtx, stream, flags, undefined);
    stream.write(FLUSH_COMMENT);
  }
};

const renderNodeVirtual = (
  node: JSXNode<typeof Virtual>,
  elCtx: QContext,
  extraNodes: JSXNode<string>[] | undefined,
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const props = node.props;
  const renderQrl = props[OnRenderProp];
  if (renderQrl) {
    elCtx.$componentQrl$ = renderQrl;
    return renderSSRComponent(rCtx, ssrCtx, stream, elCtx, node, flags, beforeClose);
  }
  let virtualComment = '<!--qv' + renderVirtualAttributes(props);
  const isSlot = QSlotS in props;
  const key = node.key != null ? String(node.key) : null;
  if (isSlot) {
    assertDefined(rCtx.$cmpCtx$?.$id$, 'hostId must be defined for a slot');
    virtualComment += ' q:sref=' + rCtx.$cmpCtx$.$id$;
  }
  if (key != null) {
    virtualComment += ' q:key=' + key;
  }
  virtualComment += '-->';
  stream.write(virtualComment);

  if (extraNodes) {
    for (const node of extraNodes) {
      renderNodeElementSync(node.type, node.props, stream);
    }
  }
  const promise = walkChildren(props.children, rCtx, ssrCtx, stream, flags);
  return then(promise, () => {
    // Fast path
    if (!isSlot && !beforeClose) {
      stream.write(CLOSE_VIRTUAL);
      return;
    }

    let promise: ValueOrPromise<void>;
    if (isSlot) {
      assertDefined(key, 'key must be defined for a slot');
      const content = ssrCtx.$projectedChildren$?.[key];
      if (content) {
        const [rCtx, sCtx] = ssrCtx.$projectedCtxs$!;
        const newSlotRctx = pushRenderContext(rCtx);
        newSlotRctx.$slotCtx$ = elCtx;
        ssrCtx.$projectedChildren$![key] = undefined;
        promise = processData(content, newSlotRctx, sCtx, stream, flags);
      }
    }
    // Inject before close
    if (beforeClose) {
      promise = then(promise, () => beforeClose(stream));
    }

    return then(promise, () => {
      stream.write(CLOSE_VIRTUAL);
    });
  });
};

const CLOSE_VIRTUAL = `<!--/qv-->`;

const renderAttributes = (attributes: Record<string, string>): string => {
  let text = '';
  for (const prop of Object.keys(attributes)) {
    if (prop === 'dangerouslySetInnerHTML') {
      continue;
    }
    const value = attributes[prop];
    if (value != null) {
      text += ' ' + (value === '' ? prop : prop + '="' + value + '"');
    }
  }
  return text;
};

const renderVirtualAttributes = (attributes: Record<string, string>): string => {
  let text = '';
  for (const prop of Object.keys(attributes)) {
    if (prop === 'children') {
      continue;
    }
    const value = attributes[prop];
    if (value != null) {
      text += ' ' + (value === '' ? prop : prop + '=' + value + '');
    }
  }
  return text;
};

const renderNodeElementSync = (
  tagName: string,
  attributes: Record<string, string>,
  stream: StreamWriter
) => {
  stream.write('<' + tagName + renderAttributes(attributes) + '>');
  const empty = !!emptyElements[tagName];
  if (empty) {
    return;
  }

  // Render innerHTML
  const innerHTML = attributes.dangerouslySetInnerHTML;
  if (innerHTML != null) {
    stream.write(innerHTML);
  }
  stream.write(`</${tagName}>`);
};

const renderSSRComponent = (
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  elCtx: QContext,
  node: JSXNode<typeof Virtual>,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  const props = node.props;
  setComponentProps(rCtx, elCtx, props.props);
  return then(executeComponent(rCtx, elCtx), (res) => {
    const hostElement = elCtx.$element$;
    const newRCtx = res.rCtx;
    const invocationContext = newInvokeContext(ssrCtx.$static$.$locale$, hostElement, undefined);
    invocationContext.$subscriber$ = hostElement;
    invocationContext.$renderCtx$ = newRCtx;
    const newSSrContext: SSRContext = {
      ...ssrCtx,
      $projectedChildren$: splitProjectedChildren(props.children, ssrCtx),
      $projectedCtxs$: [rCtx, ssrCtx],
      $invocationContext$: invocationContext,
    };

    const extraNodes: JSXNode<string>[] = [];
    if (elCtx.$appendStyles$) {
      const isHTML = !!(flags & IS_HTML);
      const array = isHTML ? ssrCtx.$static$.$headNodes$ : extraNodes;
      for (const style of elCtx.$appendStyles$) {
        array.push(
          jsx('style', {
            [QStyle]: style.styleId,
            hidden: '',
            dangerouslySetInnerHTML: style.content,
          })
        );
      }
    }
    const newID = getNextIndex(rCtx);
    const scopeId = elCtx.$scopeIds$ ? serializeSStyle(elCtx.$scopeIds$) : undefined;
    const processedNode = jsx(
      node.type,
      {
        [QScopedStyle]: scopeId,
        [ELEMENT_ID]: newID,
        children: res.node,
      },
      node.key
    );

    elCtx.$id$ = newID;
    ssrCtx.$static$.$contexts$.push(elCtx);

    return renderNodeVirtual(
      processedNode,
      elCtx,
      extraNodes,
      newRCtx,
      newSSrContext,
      stream,
      flags,
      (stream) => {
        if (elCtx.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
          const placeholderCtx = createSSRContext(1);
          const listeners = placeholderCtx.li;
          listeners.push(...elCtx.li);
          elCtx.$flags$ &= ~HOST_FLAG_NEED_ATTACH_LISTENER;
          placeholderCtx.$id$ = getNextIndex(rCtx);
          const attributes: Record<string, string> = {
            type: 'placeholder',
            hidden: '',
            'q:id': placeholderCtx.$id$,
          };
          ssrCtx.$static$.$contexts$.push(placeholderCtx);

          const groups = groupListeners(listeners);
          for (const listener of groups) {
            const eventName = normalizeInvisibleEvents(listener[0]);
            attributes[eventName] = serializeQRLs(listener[1], placeholderCtx);
            addQwikEvent(eventName, rCtx.$static$.$containerState$);
          }
          renderNodeElementSync('script', attributes, stream);
          logWarn(`Component has listeners attached, but it does not render any elements, injecting a new <script> element to attach listeners.
          This is likely to the usage of useClientEffect$() in a component that renders no elements.`);
        }
        if (beforeClose) {
          return then(renderQTemplates(rCtx, newSSrContext, stream), () => beforeClose(stream));
        } else {
          return renderQTemplates(rCtx, newSSrContext, stream);
        }
      }
    );
  });
};

const renderQTemplates = (rCtx: RenderContext, ssrContext: SSRContext, stream: StreamWriter) => {
  const projectedChildren = ssrContext.$projectedChildren$;
  if (projectedChildren) {
    const nodes = Object.keys(projectedChildren).map((slotName) => {
      const value = projectedChildren[slotName];
      if (value) {
        return jsx('q:template', {
          [QSlot]: slotName,
          hidden: '',
          'aria-hidden': 'true',
          children: value,
        });
      }
    });
    return processData(nodes, rCtx, ssrContext!, stream, 0, undefined);
  }
};

const splitProjectedChildren = (children: any, ssrCtx: SSRContext) => {
  const flatChildren = flatVirtualChildren(children, ssrCtx);
  if (flatChildren === null) {
    return undefined;
  }
  const slotMap: Record<string, any[]> = {};

  for (const child of flatChildren) {
    let slotName = '';
    if (isJSXNode(child)) {
      slotName = child.props[QSlot] ?? '';
    }
    let array = slotMap[slotName];
    if (!array) {
      slotMap[slotName] = array = [];
    }
    array.push(child);
  }
  return slotMap;
};

const createSSRContext = (nodeType: 1 | 111) => {
  const elm = {
    nodeType,
    [Q_CTX]: null,
  };
  seal(elm);
  return createContext(elm as any);
};

const renderNode = (
  node: JSXNode,
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const tagName = node.type;
  const hostCtx = rCtx.$cmpCtx$;
  const dynamicChildren = hasDynamicChildren(node);
  if (dynamicChildren && hostCtx) {
    hostCtx.$flags$ |= HOST_FLAG_DYNAMIC;
    const slotCtx = rCtx.$slotCtx$;
    if (slotCtx) {
      addDynamicSlot(hostCtx, slotCtx);
    }
  }
  if (typeof tagName === 'string') {
    const key = node.key;
    const props = node.props;
    const immutableMeta: Record<string, boolean | Signal> = (props as any)[_IMMUTABLE] ?? EMPTY_OBJ;
    const elCtx = createSSRContext(1);
    const elm = elCtx.$element$;
    const isHead = tagName === 'head';
    let openingElement = '<' + tagName;
    let useSignal = false;
    let classStr = '';
    let htmlStr = null;
    assertElement(elm);
    if (qDev && props.class && props.className) {
      throw new TypeError('Can only have one of class or className');
    }
    for (const prop of Object.keys(props)) {
      if (prop === 'children' || prop === 'dangerouslySetInnerHTML') {
        continue;
      }
      if (prop === 'ref') {
        setRef(props[prop], elm);
        continue;
      }
      let value = isSignal(immutableMeta[prop]) ? immutableMeta[prop] : props[prop];
      if (isOnProp(prop)) {
        setEvent(elCtx.li, prop, value, undefined);
        continue;
      }
      const attrName = processPropKey(prop);
      if (isSignal(value)) {
        if (hostCtx) {
          const hostEl = hostCtx.$element$ as QwikElement;
          addSignalSub(1, hostEl, value, elm, attrName);
          useSignal = true;
        }
        value = value.value;
      }
      if (prop.startsWith(PREVENT_DEFAULT)) {
        addQwikEvent(prop.slice(PREVENT_DEFAULT.length), rCtx.$static$.$containerState$);
      }
      const attrValue = processPropValue(attrName, value);
      if (attrValue != null) {
        if (attrName === 'class') {
          classStr = attrValue;
        } else if (attrName === 'value' && tagName === 'textarea') {
          htmlStr = escapeHtml(attrValue);
        } else if (isSSRUnsafeAttr(attrName)) {
          if (qDev) {
            logError('Attribute value is unsafe for SSR');
          }
        } else {
          openingElement +=
            ' ' + (value === '' ? attrName : attrName + '="' + escapeAttr(attrValue) + '"');
        }
      }
    }
    const listeners = elCtx.li;
    if (hostCtx) {
      if (qDev) {
        if (tagName === 'html') {
          throw qError(QError_canNotRenderHTML);
        }
      }
      if (hostCtx.$scopeIds$?.length) {
        const extra = hostCtx.$scopeIds$.join(' ');
        classStr = classStr ? `${extra} ${classStr}` : extra;
      }
      if (hostCtx.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
        listeners.push(...hostCtx.li);
        hostCtx.$flags$ &= ~HOST_FLAG_NEED_ATTACH_LISTENER;
      }
    }

    // Reset HOST flags
    if (qDev) {
      if (flags & IS_PHASING) {
        if (!phasingContent[tagName]) {
          throw createJSXError(
            `<${tagName}> can not be rendered because one of its ancestor is a <p> or a <pre>.\n
This goes against the HTML spec: https://html.spec.whatwg.org/multipage/dom.html#phrasing-content-2`,
            node
          );
        }
      }
      if (tagName === 'button') {
        if (flags & IS_BUTTON) {
          throw createJSXError(
            `<${tagName}> can not be rendered because one of its ancestor is already a <button>.\n
This goes against the HTML spec: https://html.spec.whatwg.org/multipage/dom.html#interactive-content`,
            node
          );
        } else {
          flags |= IS_BUTTON;
        }
      }
      if (tagName === 'a') {
        if (flags & IS_ANCHOR) {
          throw createJSXError(
            `<${tagName}> can not be rendered because one of its ancestor is already a <a>.\n
This goes against the HTML spec: https://html.spec.whatwg.org/multipage/dom.html#interactive-content`,
            node
          );
        } else {
          flags |= IS_ANCHOR;
        }
      }
      if (flags & IS_HEAD) {
        if (!headContent[tagName]) {
          throw createJSXError(
            `<${tagName}> can not be rendered because it's not a valid children of the <head> element. https://html.spec.whatwg.org/multipage/dom.html#metadata-content`,
            node
          );
        }
      }
      if (flags & IS_HTML) {
        if (!htmlContent[tagName]) {
          throw createJSXError(
            `<${tagName}> can not be rendered because it's not a valid direct children of the <html> element, only <head> and <body> are allowed.`,
            node
          );
        }
      }
      if (startPhasingContent[tagName]) {
        flags |= IS_PHASING;
      }
    }
    if (isHead) {
      flags |= IS_HEAD;
    }
    if (invisibleElements[tagName]) {
      flags |= IS_INVISIBLE;
    }
    if (textOnlyElements[tagName]) {
      flags |= IS_TEXT;
    }

    if (classStr) {
      openingElement += ' class="' + escapeAttr(classStr) + '"';
    }

    if (listeners.length > 0) {
      const groups = groupListeners(listeners);
      const isInvisible = (flags & IS_INVISIBLE) !== 0;
      for (const listener of groups) {
        const eventName = isInvisible ? normalizeInvisibleEvents(listener[0]) : listener[0];
        openingElement += ' ' + eventName + '="' + serializeQRLs(listener[1], elCtx) + '"';
        addQwikEvent(eventName, rCtx.$static$.$containerState$);
      }
    }
    if (key != null) {
      openingElement += ' q:key="' + key + '"';
    }
    if ('ref' in props || useSignal || listeners.length > 0) {
      if ('ref' in props || useSignal || listenersNeedId(listeners)) {
        const newID = getNextIndex(rCtx);
        openingElement += ' q:id="' + newID + '"';
        elCtx.$id$ = newID;
      }
      ssrCtx.$static$.$contexts$.push(elCtx);
    }
    if (flags & IS_HEAD) {
      openingElement += ' q:head';
    }
    if (qDev && qInspector && node.dev) {
      const sanitizedFileName = node?.dev?.fileName?.replace(/\\/g, '/');
      if (sanitizedFileName) {
        openingElement += ` data-qwik-inspector="${encodeURIComponent(sanitizedFileName)}:${
          node.dev.lineNumber
        }:${node.dev.columnNumber}"`;
      }
    }
    openingElement += '>';
    stream.write(openingElement);

    if (emptyElements[tagName]) {
      return;
    }

    const innerHTML = props.dangerouslySetInnerHTML ?? htmlStr;
    if (innerHTML != null) {
      stream.write(String(innerHTML));
      stream.write(`</${tagName}>`);
      return;
    }
    if (tagName === 'html') {
      flags |= IS_HTML;
    } else {
      flags &= ~IS_HTML;
    }

    const promise = processData(props.children, rCtx, ssrCtx, stream, flags);
    return then(promise, () => {
      // If head inject base styles
      if (isHead) {
        for (const node of ssrCtx.$static$.$headNodes$) {
          renderNodeElementSync(node.type, node.props, stream);
        }
        ssrCtx.$static$.$headNodes$.length = 0;
      }
      // Fast path
      if (!beforeClose) {
        stream.write(`</${tagName}>`);
        return;
      }

      // Inject before close
      return then(beforeClose(stream), () => {
        stream.write(`</${tagName}>`);
      });
    });
  }

  if (tagName === Virtual) {
    const elCtx = createSSRContext(111);
    elCtx.$parent$ = rCtx.$cmpCtx$;
    elCtx.$slotParent$ = rCtx.$slotCtx$;
    if (dynamicChildren) {
      if (hostCtx) {
        addDynamicSlot(hostCtx, elCtx);
      }
    }
    return renderNodeVirtual(
      node as JSXNode<typeof Virtual>,
      elCtx,
      undefined,
      rCtx,
      ssrCtx,
      stream,
      flags,
      beforeClose
    );
  }

  if (tagName === SSRRaw) {
    stream.write((node as JSXNode<typeof SSRRaw>).props.data);
    return;
  }
  if (tagName === InternalSSRStream) {
    return renderGenerator(node as JSXNode<typeof InternalSSRStream>, rCtx, ssrCtx, stream, flags);
  }

  if (tagName === SSRHint && (node as JSXNode<typeof SSRHint>).props.dynamic === true) {
    ssrCtx.$static$.$dynamic$ = true;
  }
  const res = invoke(ssrCtx.$invocationContext$, tagName, node.props, node.key);
  return processData(res, rCtx, ssrCtx, stream, flags, beforeClose);
};

const processData = (
  node: any,
  rCtx: RenderContext,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  if (node == null || typeof node === 'boolean') {
    return;
  }
  if (isString(node) || typeof node === 'number') {
    stream.write(escapeHtml(String(node)));
  } else if (isJSXNode(node)) {
    return renderNode(node, rCtx, ssrCtx, stream, flags, beforeClose);
  } else if (isArray(node)) {
    return walkChildren(node, rCtx, ssrCtx, stream, flags);
  } else if (isSignal(node)) {
    const insideText = flags & IS_TEXT;
    const hostEl = rCtx.$cmpCtx$?.$element$ as QwikElement;
    let value;
    if (hostEl) {
      if (!insideText) {
        value = node.value;
        const id = getNextIndex(rCtx);
        addSignalSub(2, hostEl, node, '#' + id, 'data');
        stream.write(`<!--t=${id}-->${escapeHtml(jsxToString(value))}<!---->`);
        return;
      } else {
        value = invoke(ssrCtx.$invocationContext$, () => node.value);
      }
    }
    stream.write(escapeHtml(jsxToString(value)));
    return;
  } else if (isPromise(node)) {
    stream.write(FLUSH_COMMENT);
    return node.then((node) => processData(node, rCtx, ssrCtx, stream, flags, beforeClose));
  } else {
    logWarn('A unsupported value was passed to the JSX, skipping render. Value:', node);
  }
};

const walkChildren = (
  children: any,
  rCtx: RenderContext,
  ssrContext: SSRContext,
  stream: StreamWriter,
  flags: number
): ValueOrPromise<void> => {
  if (children == null) {
    return;
  }
  if (!isArray(children)) {
    return processData(children, rCtx, ssrContext, stream, flags);
  }
  if (children.length === 1) {
    return processData(children[0], rCtx, ssrContext, stream, flags);
  }
  if (children.length === 0) {
    return;
  }

  let currentIndex = 0;
  const buffers: string[][] = [];
  return children.reduce((prevPromise, child, index) => {
    const buffer: string[] = [];
    buffers.push(buffer);
    const localStream: StreamWriter = prevPromise
      ? {
          write(chunk) {
            if (currentIndex === index) {
              stream.write(chunk);
            } else {
              buffer.push(chunk);
            }
          },
        }
      : stream;

    const rendered = processData(child, rCtx, ssrContext, localStream, flags);
    const next = () => {
      currentIndex++;
      if (buffers.length > currentIndex) {
        buffers[currentIndex].forEach((chunk) => stream.write(chunk));
      }
    };
    if (isPromise(rendered) && prevPromise) {
      return Promise.all([rendered, prevPromise]).then(next);
    } else if (isPromise(rendered)) {
      return rendered.then(next);
    } else if (prevPromise) {
      return prevPromise.then(next);
    } else {
      currentIndex++;
      return undefined;
    }
  }, undefined);
};

const flatVirtualChildren = (children: any, ssrCtx: SSRContext): any[] | null => {
  if (children == null) {
    return null;
  }
  const result = _flatVirtualChildren(children, ssrCtx);
  const nodes = isArray(result) ? result : [result];
  if (nodes.length === 0) {
    return null;
  }
  return nodes;
};

const _flatVirtualChildren = (children: any, ssrCtx: SSRContext): any => {
  if (children == null) {
    return null;
  }
  if (isArray(children)) {
    return children.flatMap((c) => _flatVirtualChildren(c, ssrCtx));
  } else if (
    isJSXNode(children) &&
    isFunction(children.type) &&
    children.type !== SSRRaw &&
    children.type !== InternalSSRStream &&
    children.type !== Virtual
  ) {
    const res = invoke(ssrCtx.$invocationContext$, children.type, children.props, children.key);
    return flatVirtualChildren(res, ssrCtx);
  }
  return children;
};

const setComponentProps = (
  rCtx: RenderContext,
  elCtx: QContext,
  expectProps: Record<string, any>
) => {
  const keys = Object.keys(expectProps);
  const target = createPropsState();

  elCtx.$props$ = createProxy(target, rCtx.$static$.$containerState$);

  if (keys.length === 0) {
    return;
  }
  const immutableMeta = ((target as any)[_IMMUTABLE] =
    (expectProps as any)[_IMMUTABLE] ?? EMPTY_OBJ);
  for (const prop of keys) {
    if (prop === 'children' || prop === QSlot) {
      continue;
    }
    if (isSignal(immutableMeta[prop])) {
      target[_IMMUTABLE_PREFIX + prop] = immutableMeta[prop];
    } else {
      target[prop] = expectProps[prop];
    }
  }
};

const processPropKey = (prop: string) => {
  if (prop === 'htmlFor') {
    return 'for';
  }
  return prop;
};

const processPropValue = (prop: string, value: any): string | null => {
  if (prop === 'style') {
    return stringifyStyle(value);
  }
  if (prop === 'class') {
    return serializeClass(value);
  }
  if (isAriaAttribute(prop) || prop === 'draggable' || prop === 'spellcheck') {
    return value != null ? String(value) : value;
  }
  if (value === false || value == null) {
    return null;
  }
  if (value === true) {
    return '';
  }
  return String(value);
};

const invisibleElements: Record<string, true | undefined> = {
  head: true,
  style: true,
  script: true,
  link: true,
  meta: true,
};

const textOnlyElements: Record<string, true | undefined> = {
  title: true,
  style: true,
  script: true,
  noframes: true,
  textarea: true,
};

const emptyElements: Record<string, true | undefined> = {
  area: true,
  base: true,
  basefont: true,
  bgsound: true,
  br: true,
  col: true,
  embed: true,
  frame: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true,
};

const startPhasingContent: Record<string, true | undefined> = {
  p: true,
  pre: true,
};

const htmlContent: Record<string, true | undefined> = {
  head: true,
  body: true,
};

const headContent: Record<string, true | undefined> = {
  meta: true,
  title: true,
  link: true,
  style: true,
  script: true,
  noscript: true,
  template: true,
  base: true,
};

const phasingContent: Record<string, true | undefined> = {
  a: true,
  abbr: true,
  audio: true,
  b: true,
  bdo: true,
  br: true,
  button: true,
  canvas: true,
  cite: true,
  code: true,
  command: true,
  data: true,
  datalist: true,
  dfn: true,
  em: true,
  embed: true,
  i: true,
  iframe: true,
  img: true,
  input: true,
  kbd: true,
  keygen: true,
  label: true,
  mark: true,
  math: true,
  meter: true,
  noscript: true,
  object: true,
  output: true,
  picture: true,
  progress: true,
  q: true,
  ruby: true,
  s: true,
  samp: true,
  script: true,
  select: true,
  small: true,
  span: true,
  strong: true,
  sub: true,
  sup: true,
  svg: true,
  textarea: true,
  time: true,
  u: true,
  var: true,
  video: true,
  wbr: true,
};

export interface ServerDocument {
  nodeType: 9;
  parentElement: null;
  ownerDocument: null;
  createElement(tagName: string): any;
}

const ESCAPE_HTML = /[&<>]/g;
const ESCAPE_ATTRIBUTES = /[&"]/g;

const escapeHtml = (s: string) => {
  return s.replace(ESCAPE_HTML, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      default:
        return '';
    }
  });
};

const escapeAttr = (s: string) => {
  return s.replace(ESCAPE_ATTRIBUTES, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '';
    }
  });
};

// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
const unsafeAttrCharRE = /[>/="'\u0009\u000a\u000c\u0020]/; // eslint-disable-line no-control-regex
export const isSSRUnsafeAttr = (name: string): boolean => {
  return unsafeAttrCharRE.test(name);
};

const listenersNeedId = (listeners: Listener[]) => {
  return listeners.some((l) => l[1].$captureRef$ && l[1].$captureRef$.length > 0);
};

const addDynamicSlot = (hostCtx: QContext, elCtx: QContext) => {
  let dynamicSlots = hostCtx.$dynamicSlots$;
  if (!dynamicSlots) {
    hostCtx.$dynamicSlots$ = dynamicSlots = [];
  }
  if (!dynamicSlots.includes(elCtx)) {
    dynamicSlots.push(elCtx);
  }
};

const normalizeInvisibleEvents = (eventName: string) => {
  return eventName === 'on:qvisible' ? 'on-document:qinit' : eventName;
};

const hasDynamicChildren = (node: JSXNode) => {
  return (node.props as any)[_IMMUTABLE]?.children === false;
};
