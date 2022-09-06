import { isNotNullable, isPromise, then } from '../../util/promises';
import { InvokeContext, newInvokeContext, invoke } from '../../use/use-core';
import { isJSXNode, jsx } from '../jsx/jsx-runtime';
import { isArray, isFunction, isString, ValueOrPromise } from '../../util/types';
import { getContext, getPropsMutator, QContext } from '../../props/props';
import type { JSXNode } from '../jsx/types/jsx-node';
import {
  ALLOWS_PROPS,
  createRenderContext,
  executeComponent,
  getNextIndex,
  joinClasses,
  stringifyStyle,
} from '../execute-component';
import {
  ELEMENT_ID,
  OnRenderProp,
  QScopedStyle,
  QSlot,
  QSlotRef,
  QSlotS,
  QStyle,
} from '../../util/markers';
import { SSRComment, Virtual } from '../jsx/utils.public';
import { logError, logWarn } from '../../util/log';
import { addQRLListener, isOnProp, setEvent } from '../../props/props-on';
import { version } from '../../version';
import { serializeQRLs } from '../../import/qrl';
import { ContainerState, getContainerState } from '../container';
import type { RenderContext } from '../types';
import { assertDefined } from '../../assert/assert';
import { serializeSStyle, styleHost } from '../../component/qrl-styles';
import type { Ref } from '../../use/use-ref';
import { serializeVirtualAttributes, VIRTUAL } from '../dom/virtual-element';
import { qDev } from '../../util/qdev';
import { qError, QError_canNotRenderHTML } from '../../error/error';

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
  beforeContent?: JSXNode[];
  beforeClose?: (contexts: QContext[], containerState: ContainerState) => Promise<JSXNode>;
}

export interface SSRContext {
  rctx: RenderContext;
  projectedChildren: Record<string, any[] | undefined> | undefined;
  projectedContext: SSRContext | undefined;
  hostCtx: QContext | undefined;
  invocationContext?: InvokeContext | undefined;
  $contexts$: QContext[];
  headNodes: JSXNode[];
}

const IS_HEAD = 1 << 0;
const IS_RAW_CONTENT = 1 << 1;
const IS_HTML = 1 << 2;

/**
 * @alpha
 */
export const renderSSR = async (doc: Document, node: JSXNode, opts: RenderSSROptions) => {
  const root = opts.containerTagName;
  const containerEl = doc.createElement(root);
  const containerState = getContainerState(containerEl);
  const rctx = createRenderContext(doc, containerState);
  const headNodes = opts.beforeContent ?? [];
  const ssrCtx: SSRContext = {
    rctx,
    $contexts$: [],
    projectedChildren: undefined,
    projectedContext: undefined,
    hostCtx: undefined,
    invocationContext: undefined,
    headNodes: root === 'html' ? headNodes : [],
  };

  const containerAttributes: Record<string, string> = {
    ...opts.containerAttributes,
    'q:container': 'paused',
    'q:version': version ?? 'dev',
    'q:render': qDev ? 'ssr-dev' : 'ssr',
  };
  if (opts.base) {
    containerAttributes['q:base'] = opts.base;
  }
  if (opts.url) {
    containerState.$envData$['url'] = opts.url;
  }
  if (opts.envData) {
    Object.assign(containerState.$envData$, opts.envData);
  }

  if (root === 'html') {
    node = jsx(root, {
      ...containerAttributes,
      children: [node],
    });
  } else {
    node = jsx(root, {
      ...containerAttributes,
      children: [...(headNodes ?? []), node],
    });
  }
  containerState.$hostsRendering$ = new Set();
  containerState.$renderPromise$ = Promise.resolve().then(() =>
    renderRoot(node, ssrCtx, opts.stream, containerState, opts)
  );
  await containerState.$renderPromise$;
};

export const renderRoot = async (
  node: JSXNode<string>,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  containerState: ContainerState,
  opts: RenderSSROptions
) => {
  const beforeClose = opts.beforeClose;
  await renderNode(node, ssrCtx, stream, 0, (stream) => {
    const result = beforeClose?.(ssrCtx.$contexts$, containerState);
    if (result) {
      return processData(result, ssrCtx, stream, 0, undefined);
    }
  });
  if (qDev) {
    if (ssrCtx.headNodes.length > 0) {
      logError(
        'Missing <head>. Global styles could not be rendered. Please render a <head> element at the root of the app'
      );
    }
  }
  return ssrCtx.rctx.$static$;
};

export const renderNodeFunction = (
  node: JSXNode<any>,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const fn = node.type;
  if (fn === SSRComment) {
    stream.write(`<!--${node.props.data ?? ''}-->`);
    return;
  }
  if (fn === Virtual) {
    const elCtx = getContext(ssrCtx.rctx.$static$.$doc$.createElement(VIRTUAL));
    return renderNodeVirtual(node, elCtx, undefined, ssrCtx, stream, flags, beforeClose);
  }
  const res = ssrCtx.invocationContext
    ? invoke(ssrCtx.invocationContext, () => node.type(node.props, node.key))
    : node.type(node.props, node.key);
  return processData(res, ssrCtx, stream, flags, beforeClose);
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
    elCtx.$renderQrl$ = renderQrl;
    return renderSSRComponent(ssrCtx, stream, elCtx, node, flags, beforeClose);
  }
  const { children, ...attributes } = node.props;

  const isSlot = QSlotS in props;
  const key = node.key != null ? String(node.key) : null;
  if (isSlot) {
    assertDefined(ssrCtx.hostCtx?.$id$, 'hostId must be defined for a slot');
    attributes[QSlotRef] = ssrCtx.hostCtx.$id$;
  }

  if (key != null) {
    attributes['q:key'] = key;
  }
  const url = new Map(Object.entries(attributes));
  stream.write(`<!--qv ${serializeVirtualAttributes(url)}-->`);

  if (extraNodes) {
    for (const node of extraNodes) {
      renderNodeElementSync(node.type, node.props, stream);
    }
  }
  const promise = processData(props.children, ssrCtx, stream, flags);
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

export const renderNodeElement = (
  node: JSXNode<string>,
  extraAttributes: Record<string, string | undefined> | undefined,
  extraNodes: JSXNode<string>[] | undefined,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  const key = node.key != null ? String(node.key) : null;
  const props = node.props;
  const textType = node.type;
  const elCtx = getContext(ssrCtx.rctx.$static$.$doc$.createElement(node.type));
  const hasRef = 'ref' in props;
  const attributes = updateProperties(elCtx, props);
  const hostCtx = ssrCtx.hostCtx;
  if (hostCtx) {
    if (textType === 'html') {
      throw qError(QError_canNotRenderHTML);
    }
    attributes['class'] = joinClasses(hostCtx.$scopeIds$, attributes['class']);
    const cmp = hostCtx;
    if (!cmp.$attachedListeners$) {
      cmp.$attachedListeners$ = true;
      Object.entries(hostCtx.li).forEach(([eventName, qrls]) => {
        addQRLListener(elCtx.li, eventName, qrls);
      });
    }
  }

  // Reset HOST flags
  if (textType === 'head') {
    flags |= IS_HEAD;
  }

  const listeners = Object.entries(elCtx.li);
  const isHead = flags & IS_HEAD;

  if (key != null) {
    attributes['q:key'] = key;
  }
  if (hasRef || listeners.length > 0) {
    const newID = getNextIndex(ssrCtx.rctx);
    attributes[ELEMENT_ID] = newID;
    elCtx.$id$ = newID;
    ssrCtx.$contexts$.push(elCtx);
  }
  if (isHead) {
    attributes['q:head'] = '';
  }
  if (extraAttributes) {
    Object.assign(attributes, extraAttributes);
  }
  listeners.forEach(([key, value]) => {
    attributes[key] = serializeQRLs(value, elCtx);
  });
  if (renderNodeElementSync(textType, attributes, stream)) {
    return;
  }
  if (textType !== 'head') {
    flags &= ~IS_HEAD;
  }
  if (textType === 'html') {
    flags |= IS_HTML;
  } else {
    flags &= ~IS_HTML;
  }
  if (hasRawContent[textType]) {
    flags |= IS_RAW_CONTENT;
  } else {
    flags &= ~IS_RAW_CONTENT;
  }

  if (extraNodes) {
    for (const node of extraNodes) {
      renderNodeElementSync(node.type, node.props, stream);
    }
  }
  const promise = processData(props.children, ssrCtx, stream, flags);
  return then(promise, () => {
    // If head inject base styles
    if (textType === 'head') {
      ssrCtx.headNodes.forEach((node) => {
        renderNodeElementSync(node.type, node.props, stream);
      });
      ssrCtx.headNodes.length = 0;
    }
    // Fast path
    if (!beforeClose) {
      stream.write(`</${textType}>`);
      return;
    }

    // Inject before close
    return then(beforeClose(stream), () => {
      stream.write(`</${textType}>`);
    });
  });
};

export const renderNodeElementSync = (
  tagName: string,
  attributes: Record<string, string>,
  stream: StreamWriter
): boolean => {
  stream.write(`<${tagName}`);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key !== 'dangerouslySetInnerHTML' && key !== 'children') {
      if (key === 'class' && !value) {
        return;
      }
      const chunk = value === '' ? ` ${key}` : ` ${key}="${escapeAttr(value)}"`;
      stream.write(chunk);
    }
  });

  stream.write(`>`);
  const empty = !!emptyElements[tagName];
  if (empty) {
    return true;
  }

  // Render innerHTML
  const innerHTML = attributes.dangerouslySetInnerHTML;
  if (innerHTML) {
    stream.write(innerHTML);
    stream.write(`</${tagName}>`);
    return true;
  }
  return false;
};

export const mergeChildren = (a: any, b: any): any[] => {
  const output = [];
  if (a) {
    if (isArray(a)) {
      output.push(...a);
    } else {
      output.push(a);
    }
  }
  if (b) {
    if (isArray(b)) {
      output.push(...b);
    } else {
      output.push(b);
    }
  }
  return output;
};

export const renderSSRComponent = (
  ssrCtx: SSRContext,
  stream: StreamWriter,
  elCtx: QContext,
  node: JSXNode<typeof Virtual>,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  const attributes: Record<string, string> = updateComponentProperties(
    ssrCtx.rctx,
    elCtx,
    node.props
  );
  return then(executeComponent(ssrCtx.rctx, elCtx), (res) => {
    if (!res) {
      logError('component was not rendered during SSR');
      return;
    }

    const hostElement = elCtx.$element$;
    const newCtx = res.rctx;
    let children = node.props.children;
    if (children) {
      if (isArray(children)) {
        if (children.filter(isNotNullable).length === 0) {
          children = undefined;
        }
      } else {
        children = [children];
      }
    }
    const invocationContext = newInvokeContext(newCtx.$static$.$doc$, hostElement, undefined);
    invocationContext.$subscriber$ = hostElement;
    invocationContext.$renderCtx$ = newCtx;
    const projectedContext: SSRContext = {
      ...ssrCtx,
      rctx: newCtx,
    };
    const newSSrContext: SSRContext = {
      ...ssrCtx,
      projectedChildren: splitProjectedChildren(children, ssrCtx),
      projectedContext,
      rctx: newCtx,
      invocationContext,
    };

    const extraNodes: JSXNode<any>[] = [];
    const styleClasses = [];
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
    if (elCtx.$scopeIds$) {
      for (const styleId of elCtx.$scopeIds$) {
        styleClasses.push(styleHost(styleId));
      }
      const value = serializeSStyle(elCtx.$scopeIds$);
      if (value) {
        attributes[QScopedStyle] = value;
      }
    }
    const newID = getNextIndex(ssrCtx.rctx);
    attributes[ELEMENT_ID] = newID;
    elCtx.$id$ = newID;
    ssrCtx.$contexts$.push(elCtx);

    const processedNode = jsx(
      node.type,
      {
        ...attributes,
        children: res.node,
      },
      node.key
    );

    newSSrContext.hostCtx = elCtx;

    return renderNodeVirtual(
      processedNode,
      elCtx,
      extraNodes,
      newSSrContext,
      stream,
      flags,
      (stream) => {
        return then(renderQTemplates(newSSrContext, stream), () => {
          return beforeClose?.(stream);
        });
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

export const renderNode = (
  node: JSXNode<any>,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  if (typeof node.type === 'string') {
    return renderNodeElement(node as any, undefined, undefined, ssrCtx, stream, flags, beforeClose);
  } else {
    return renderNodeFunction(node, ssrCtx, stream, flags, beforeClose);
  }
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
  if (isJSXNode(node)) {
    return renderNode(node, ssrCtx, stream, flags, beforeClose);
  } else if (isPromise(node)) {
    return node.then((node) => processData(node, ssrCtx, stream, flags, beforeClose));
  } else if (isArray(node)) {
    node = _flatVirtualChildren(node, ssrCtx);
    return walkChildren(node, ssrCtx, stream, flags);
  } else if (isString(node) || typeof node === 'number') {
    if ((flags & IS_RAW_CONTENT) !== 0) {
      stream.write(String(node));
    } else {
      stream.write(escape(String(node)));
    }
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
    const localStream: StreamWriter = {
      write(chunk) {
        if (currentIndex === index) {
          stream.write(chunk);
        } else {
          buffer.push(chunk);
        }
      },
    };
    return then(processData(child, ssrContext, localStream, flags), () => {
      return then(prevPromise, () => {
        currentIndex++;
        if (buffers.length > currentIndex) {
          buffers[currentIndex].forEach((chunk) => stream.write(chunk));
        }
      });
    });
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

export const _flatVirtualChildren = (children: any, ssrCtx: SSRContext): any => {
  if (children == null) {
    return null;
  }
  if (isArray(children)) {
    return children.flatMap((c) => _flatVirtualChildren(c, ssrCtx));
  } else if (
    isJSXNode(children) &&
    isFunction(children.type) &&
    children.type !== SSRComment &&
    children.type !== Virtual
  ) {
    const fn = children.type;
    const res = ssrCtx.invocationContext
      ? invoke(ssrCtx.invocationContext, () => fn(children.props, children.key))
      : fn(children.props, children.key);
    return flatVirtualChildren(res, ssrCtx);
  }
  return children;
};

const updateProperties = (ctx: QContext, expectProps: Record<string, any> | null) => {
  const attributes: Record<string, string> = {};
  if (!expectProps) {
    return attributes;
  }
  const keys = Object.keys(expectProps);
  if (keys.length === 0) {
    return attributes;
  }
  const elm = ctx.$element$;
  for (const key of keys) {
    if (key === 'children' || key === OnRenderProp) {
      continue;
    }
    const newValue = expectProps[key];
    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    // Early exit if value didnt change
    // Check of data- or aria-
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      attributes[key] = newValue;
      continue;
    }

    if (isOnProp(key)) {
      setEvent(ctx.li, key, newValue);
      continue;
    }

    // Check if its an exception
    setProperty(attributes, key, newValue);
  }
  return attributes;
};

const updateComponentProperties = (
  rctx: RenderContext,
  ctx: QContext,
  expectProps: Record<string, any> | null
) => {
  const attributes: Record<string, string> = {};
  if (!expectProps) {
    return attributes;
  }
  const keys = Object.keys(expectProps);
  if (keys.length === 0) {
    return attributes;
  }
  const qwikProps = getPropsMutator(ctx, rctx.$static$.$containerState$);
  for (const key of keys) {
    if (key === 'children' || key === OnRenderProp) {
      continue;
    }
    const newValue = expectProps[key];

    const skipProperty = ALLOWS_PROPS.includes(key);
    if (!skipProperty) {
      // Qwik props
      qwikProps.set(key, newValue);
      continue;
    }
    setProperty(attributes, key, newValue);
  }
  return attributes;
};

function setProperty(attributes: Record<string, string>, prop: string, value: any) {
  if (value != null && value !== false) {
    prop = processPropKey(prop);
    const attrValue = processPropValue(prop, value, attributes[prop]);
    if (attrValue !== null) {
      attributes[prop] = attrValue;
    }
  }
}

function processPropKey(prop: string) {
  if (prop === 'className') {
    return 'class';
  }
  return prop;
}

function processPropValue(prop: string, value: any, prevValue: string | undefined): string | null {
  if (prop === 'class') {
    const str = joinClasses(value, prevValue);
    return str === '' ? null : str;
  }
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

const hasRawContent: Record<string, true | undefined> = {
  style: true,
  script: true,
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

export const escape = (s: string) => {
  return s.replace(/[&<>\u00A0]/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '\u00A0':
        return '&nbsp;';
      default:
        return '';
    }
  });
};

export const escapeAttr = (s: string) => {
  const toEscape = /[&"\u00A0]/g;
  if (!toEscape.test(s)) {
    // nothing to do, fast path
    return s;
  } else {
    return s.replace(toEscape, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '"':
          return '&quot;';
        case '\u00A0':
          return '&nbsp;';
        default:
          return '';
      }
    });
  }
};
