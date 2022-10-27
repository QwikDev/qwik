import { isPromise, then } from '../../util/promises';
import { InvokeContext, newInvokeContext, invoke } from '../../use/use-core';
import { isJSXNode, jsx } from '../jsx/jsx-runtime';
import { isArray, isFunction, isString, ValueOrPromise } from '../../util/types';
import type { JSXNode } from '../jsx/types/jsx-node';
import {
  createRenderContext,
  executeComponent,
  getNextIndex,
  jsxToString,
  stringifyStyle,
} from '../execute-component';
import { ELEMENT_ID, OnRenderProp, QScopedStyle, QSlot, QSlotS, QStyle } from '../../util/markers';
import { InternalSSRStream, Virtual, SSRRaw } from '../jsx/utils.public';
import { logError, logWarn } from '../../util/log';
import { groupListeners, isOnProp, PREVENT_DEFAULT, setEvent } from '../../state/listeners';
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
import { qDev, seal } from '../../util/qdev';
import { qError, QError_canNotRenderHTML } from '../../error/error';
import { addSignalSub, isSignal, Signal } from '../../state/signal';
import { serializeQRLs } from '../../qrl/qrl';
import type { QwikElement } from '../dom/virtual-element';
import { assertElement } from '../../util/element';
import { EMPTY_OBJ } from '../../util/flyweight';
import type { QRLInternal } from '../../qrl/qrl-class';
import {
  getContext,
  HOST_FLAG_DYNAMIC,
  HOST_FLAG_NEED_ATTACH_LISTENER,
  QContext,
  Q_CTX,
} from '../../state/context';
import { createProxy } from '../../state/store';
import {
  QObjectFlagsSymbol,
  QObjectImmutable,
  _IMMUTABLE,
  _IMMUTABLE_PREFIX,
} from '../../state/constants';

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
  beforeClose?: (contexts: QContext[], containerState: ContainerState) => Promise<JSXNode>;
}

export interface SSRContext {
  rCtx: RenderContext;
  projectedChildren: Record<string, any[] | undefined> | undefined;
  projectedContext: SSRContext | undefined;
  hostCtx: QContext | null;
  invocationContext?: InvokeContext | undefined;
  $contexts$: QContext[];
  $pendingListeners$: [string, QRLInternal][];
  headNodes: JSXNode<string>[];
}

const IS_HEAD = 1 << 0;
const IS_HTML = 1 << 2;
const IS_TEXT = 1 << 3;

export const createDocument = () => {
  const doc = { nodeType: 9 };
  seal(doc);
  return doc;
};

/**
 * @alpha
 */
export const renderSSR = async (node: JSXNode, opts: RenderSSROptions) => {
  const root = opts.containerTagName;
  const containerEl = createContext(1).$element$;
  const containerState = createContainerState(containerEl as Element);
  const doc = createDocument();
  const rCtx = createRenderContext(doc as any, containerState);
  const headNodes = opts.beforeContent ?? [];
  const ssrCtx: SSRContext = {
    rCtx,
    $contexts$: [],
    projectedChildren: undefined,
    projectedContext: undefined,
    hostCtx: null,
    invocationContext: undefined,
    headNodes: root === 'html' ? headNodes : [],
    $pendingListeners$: [],
  };

  const containerAttributes: Record<string, any> = {
    ...opts.containerAttributes,
    'q:container': 'paused',
    'q:version': version ?? 'dev',
    'q:render': qDev ? 'ssr-dev' : 'ssr',
    'q:base': opts.base,
    children: root === 'html' ? [node] : [headNodes, node],
  };
  containerState.$envData$ = {
    url: opts.url,
    ...opts.envData,
  };

  node = jsx(root, containerAttributes);
  containerState.$hostsRendering$ = new Set();
  containerState.$renderPromise$ = Promise.resolve().then(() =>
    renderRoot(node, ssrCtx, opts.stream, containerState, opts)
  );
  await containerState.$renderPromise$;
};

export const renderRoot = async (
  node: JSXNode,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  containerState: ContainerState,
  opts: RenderSSROptions
) => {
  const beforeClose = opts.beforeClose;

  await renderNode(
    node,
    ssrCtx,
    stream,
    0,
    beforeClose
      ? (stream: StreamWriter) => {
          const result = beforeClose(ssrCtx.$contexts$, containerState);
          return processData(result, ssrCtx, stream, 0, undefined);
        }
      : undefined
  );

  if (qDev) {
    if (ssrCtx.headNodes.length > 0) {
      logError(
        'Missing <head>. Global styles could not be rendered. Please render a <head> element at the root of the app'
      );
    }
  }
  return ssrCtx.rCtx.$static$;
};

export const renderGenerator = async (
  node: JSXNode<typeof InternalSSRStream>,
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
    await processData(chunk, ssrCtx, stream, flags, undefined);
    stream.write(FLUSH_COMMENT);
  }
};

export const renderNodeVirtual = (
  node: JSXNode<typeof Virtual>,
  elCtx: QContext,
  extraNodes: JSXNode<string>[] | undefined,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const props = node.props;
  const renderQrl = props[OnRenderProp];
  if (renderQrl) {
    elCtx.$componentQrl$ = renderQrl;
    return renderSSRComponent(ssrCtx, stream, elCtx, node, flags, beforeClose);
  }
  let virtualComment = '<!--qv' + renderVirtualAttributes(props);
  const isSlot = QSlotS in props;
  const key = node.key != null ? String(node.key) : null;
  if (isSlot) {
    assertDefined(ssrCtx.hostCtx?.$id$, 'hostId must be defined for a slot');
    virtualComment += ' q:sref=' + ssrCtx.hostCtx.$id$;
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
  const promise = walkChildren(props.children, ssrCtx, stream, flags);
  return then(promise, () => {
    // Fast path
    if (!isSlot && !beforeClose) {
      stream.write(CLOSE_VIRTUAL);
      return;
    }

    let promise: ValueOrPromise<void>;
    if (isSlot) {
      assertDefined(key, 'key must be defined for a slot');
      const content = ssrCtx.projectedChildren?.[key];
      if (content) {
        ssrCtx.projectedChildren![key] = undefined;
        promise = processData(content, ssrCtx.projectedContext!, stream, flags);
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

export const renderAttributes = (attributes: Record<string, string>): string => {
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

export const renderVirtualAttributes = (attributes: Record<string, string>): string => {
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

export const renderNodeElementSync = (
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

export const renderSSRComponent = (
  ssrCtx: SSRContext,
  stream: StreamWriter,
  elCtx: QContext,
  node: JSXNode<typeof Virtual>,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  const props = node.props;
  setComponentProps(ssrCtx.rCtx, elCtx, props.props);
  return then(executeComponent(ssrCtx.rCtx, elCtx), (res) => {
    const hostElement = elCtx.$element$;
    const newCtx = res.rCtx;
    const invocationContext = newInvokeContext(hostElement, undefined);
    invocationContext.$subscriber$ = hostElement;
    invocationContext.$renderCtx$ = newCtx;
    const projectedContext: SSRContext = {
      ...ssrCtx,
      rCtx: newCtx,
    };
    const newSSrContext: SSRContext = {
      ...ssrCtx,
      projectedChildren: splitProjectedChildren(props.children, ssrCtx),
      projectedContext,
      rCtx: newCtx,
      invocationContext,
    };

    const extraNodes: JSXNode<string>[] = [];
    if (elCtx.$appendStyles$) {
      const isHTML = !!(flags & IS_HTML);
      const array = isHTML ? ssrCtx.headNodes : extraNodes;
      for (const style of elCtx.$appendStyles$) {
        array.push(
          jsx('style', {
            [QStyle]: style.styleId,
            dangerouslySetInnerHTML: style.content,
          })
        );
      }
    }
    const newID = getNextIndex(ssrCtx.rCtx);
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
    ssrCtx.$contexts$.push(elCtx);
    newSSrContext.hostCtx = elCtx;

    return renderNodeVirtual(
      processedNode,
      elCtx,
      extraNodes,
      newSSrContext,
      stream,
      flags,
      (stream) => {
        if (elCtx.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
          logWarn('Component registered some events, some component use useStyles$()');
        }
        if (beforeClose) {
          return then(renderQTemplates(newSSrContext, stream), () => beforeClose(stream));
        } else {
          return renderQTemplates(newSSrContext, stream);
        }
      }
    );
  });
};

const renderQTemplates = (ssrContext: SSRContext, stream: StreamWriter) => {
  const projectedChildren = ssrContext.projectedChildren;
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
    return processData(nodes, ssrContext, stream, 0, undefined);
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

export const createContext = (nodeType: 1 | 111) => {
  const elm = {
    nodeType,
    [Q_CTX]: null,
  };
  seal(elm);
  return getContext(elm as any);
};

export const renderNode = (
  node: JSXNode,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const tagName = node.type;
  const hostCtx = ssrCtx.hostCtx;
  if (hostCtx && hasDynamicChildren(node)) {
    hostCtx.$flags$ |= HOST_FLAG_DYNAMIC;
  }
  if (typeof tagName === 'string') {
    const key = node.key;
    const props = node.props;
    const immutableMeta: Record<string, boolean | Signal> = (props as any)[_IMMUTABLE] ?? EMPTY_OBJ;
    const elCtx = createContext(1);
    const elm = elCtx.$element$;
    const isHead = tagName === 'head';
    let openingElement = '<' + tagName;
    let useSignal = false;
    assertElement(elm);
    for (const prop of Object.keys(props)) {
      if (
        prop === 'children' ||
        prop === 'key' ||
        prop === 'class' ||
        prop === 'className' ||
        prop === 'dangerouslySetInnerHTML'
      ) {
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
        addQwikEvent(prop.slice(PREVENT_DEFAULT.length), ssrCtx.rCtx.$static$.$containerState$);
      }
      const attrValue = processPropValue(attrName, value);
      if (attrValue != null) {
        openingElement +=
          ' ' + (value === '' ? attrName : attrName + '="' + escapeAttr(attrValue) + '"');
      }
    }
    const listeners = elCtx.li;
    const classValue = props.class ?? props.className;
    let classStr = stringifyClass(classValue);

    if (hostCtx) {
      if (qDev) {
        if (tagName === 'html') {
          throw qError(QError_canNotRenderHTML);
        }
      }
      if (hostCtx.$scopeIds$) {
        classStr = hostCtx.$scopeIds$.join(' ') + ' ' + classStr;
      }
      if (hostCtx.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
        listeners.push(...hostCtx.li);
        hostCtx.$flags$ &= ~HOST_FLAG_NEED_ATTACH_LISTENER;
      }
    }

    // Reset HOST flags
    if (isHead) {
      flags |= IS_HEAD;
    }
    if (textOnlyElements[tagName]) {
      flags |= IS_TEXT;
    }

    classStr = classStr.trim();
    if (classStr) {
      openingElement += ' class="' + classStr + '"';
    }

    if (listeners.length > 0) {
      const groups = groupListeners(listeners);
      for (const listener of groups) {
        openingElement += ' ' + listener[0] + '="' + serializeQRLs(listener[1], elCtx) + '"';
        addQwikEvent(listener[0], ssrCtx.rCtx.$static$.$containerState$);
      }
    }
    if (key != null) {
      openingElement += ' q:key="' + key + '"';
    }
    if ('ref' in props || listeners.length > 0 || useSignal) {
      const newID = getNextIndex(ssrCtx.rCtx);
      openingElement += ' q:id="' + newID + '"';
      elCtx.$id$ = newID;
      ssrCtx.$contexts$.push(elCtx);
    }
    if (flags & IS_HEAD) {
      openingElement += ' q:head';
    }
    openingElement += '>';
    stream.write(openingElement);

    if (emptyElements[tagName]) {
      return;
    }

    const innerHTML = props.dangerouslySetInnerHTML;
    if (innerHTML != null) {
      stream.write(String(innerHTML));
      stream.write(`</${tagName}>`);
      return;
    }
    if (!isHead) {
      flags &= ~IS_HEAD;
    }
    if (tagName === 'html') {
      flags |= IS_HTML;
    } else {
      flags &= ~IS_HTML;
    }

    const promise = processData(props.children, ssrCtx, stream, flags);
    return then(promise, () => {
      // If head inject base styles
      if (isHead) {
        for (const node of ssrCtx.headNodes) {
          renderNodeElementSync(node.type, node.props, stream);
        }
        ssrCtx.headNodes.length = 0;
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
    const elCtx = createContext(111);
    elCtx.$parent$ = ssrCtx.hostCtx;
    return renderNodeVirtual(
      node as JSXNode<typeof Virtual>,
      elCtx,
      undefined,
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
    return renderGenerator(node as JSXNode<typeof InternalSSRStream>, ssrCtx, stream, flags);
  }

  const res = invoke(ssrCtx.invocationContext, tagName, node.props, node.key);
  return processData(res, ssrCtx, stream, flags, beforeClose);
};
export const processData = (
  node: any,
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
    return renderNode(node, ssrCtx, stream, flags, beforeClose);
  } else if (isArray(node)) {
    return walkChildren(node, ssrCtx, stream, flags);
  } else if (isSignal(node)) {
    const insideText = flags & IS_TEXT;
    const hostEl = ssrCtx.hostCtx?.$element$ as QwikElement;
    let value;
    if (hostEl) {
      if (!insideText) {
        value = node.value;
        const id = getNextIndex(ssrCtx.rCtx);
        addSignalSub(2, hostEl, node, '#' + id, 'data');
        stream.write(`<!--t=${id}-->${escapeHtml(jsxToString(value))}<!---->`);
        return;
      } else {
        value = invoke(ssrCtx.invocationContext, () => node.value);
      }
    }
    stream.write(escapeHtml(jsxToString(value)));
    return;
  } else if (isPromise(node)) {
    stream.write(FLUSH_COMMENT);
    return node.then((node) => processData(node, ssrCtx, stream, flags, beforeClose));
  } else {
    logWarn('A unsupported value was passed to the JSX, skipping render. Value:', node);
  }
};

function walkChildren(
  children: any,
  ssrContext: SSRContext,
  stream: StreamWriter,
  flags: number
): ValueOrPromise<void> {
  if (children == null) {
    return;
  }
  if (!isArray(children)) {
    return processData(children, ssrContext, stream, flags);
  }
  if (children.length === 1) {
    return processData(children[0], ssrContext, stream, flags);
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

    const rendered = processData(child, ssrContext, localStream, flags);
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
}

export const flatVirtualChildren = (children: any, ssrCtx: SSRContext): any[] | null => {
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

export const stringifyClass = (str: any) => {
  if (!str) {
    return '';
  }
  if (typeof str === 'string') {
    return str;
  }
  if (Array.isArray(str)) {
    return str.join(' ');
  }
  const output: string[] = [];
  for (const key in str) {
    if (Object.prototype.hasOwnProperty.call(str, key)) {
      const value = str[key];
      if (value) {
        output.push(key);
      }
    }
  }
  return output.join(' ');
};

export const _flatVirtualChildren = (children: any, ssrCtx: SSRContext): any => {
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
    const res = invoke(ssrCtx.invocationContext, children.type, children.props, children.key);
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
  const target = {
    [QObjectFlagsSymbol]: QObjectImmutable,
  } as Record<string, any>;
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

function processPropKey(prop: string) {
  if (prop === 'htmlFor') {
    return 'for';
  }
  return prop;
}

function processPropValue(prop: string, value: any): string | null {
  if (prop === 'style') {
    return stringifyStyle(value);
  }
  if (value === false || value == null) {
    return null;
  }
  if (value === true) {
    return '';
  }
  return String(value);
}

const textOnlyElements: Record<string, true | undefined> = {
  title: true,
  style: true,
  script: true,
  noframes: true,
  noscript: true,
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

export interface ServerDocument {
  nodeType: 9;
  parentElement: null;
  ownerDocument: null;
  createElement(tagName: string): any;
}

const ESCAPE_HTML = /[&<>]/g;
const ESCAPE_ATTRIBUTES = /[&"]/g;

export const escapeHtml = (s: string) => {
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

export const escapeAttr = (s: string) => {
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

export const joinClasses = (styles: any[], existing: string): string => {
  return styles.join(' ') + existing;
};

const hasDynamicChildren = (node: JSXNode) => {
  return (node.props as any)[_IMMUTABLE]?.children === false;
};
