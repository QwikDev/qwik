import { isNotNullable, isPromise, then } from '../../util/promises';
import { InvokeContext, newInvokeContext, useInvoke } from '../../use/use-core';
import { isJSXNode, jsx } from '../jsx/jsx-runtime';
import { isArray, isFunction, isString, ValueOrPromise } from '../../util/types';
import { getContext, getPropsMutator, normalizeOnProp, QContext } from '../../props/props';
import type { JSXNode } from '../jsx/types/jsx-node';
import {
  ALLOWS_PROPS,
  BASE_QWIK_STYLES,
  copyRenderContext,
  createRenderContext,
  executeComponent,
  getNextIndex,
  HOST_PREFIX,
  joinClasses,
  SCOPE_PREFIX,
  stringifyStyle,
} from '../execute-component';
import {
  ELEMENT_ID,
  OnRenderProp,
  QCtxAttr,
  QScopedStyle,
  QSlot,
  QSlotName,
  QSlotRef,
  QStyle,
} from '../../util/markers';
import { Host, SSRComment } from '../jsx/host.public';
import { qDev } from '../../util/qdev';
import { logWarn } from '../../util/log';
import { addQRLListener, isOnProp } from '../../props/props-on';
import type { StreamWriter } from '../../../server/types';
import type { Ref } from '../../use/use-store.public';
import { version } from '../../version';
import { serializeInlineContexts } from '../../use/use-context';
import { fromCamelToKebabCase } from '../../util/case';
import { serializeQRLs } from '../../import/qrl';
import { qError, QError_rootNodeMustBeHTML } from '../../error/error';
import { ContainerState, getContainerState } from '../container';
import type { RenderContext } from '../types';
import { assertDefined } from '../../assert/assert';
import { serializeSStyle, styleHost } from '../../component/qrl-styles';

export interface SSRContext {
  rctx: RenderContext;
  projectedChildren: Record<string, any[] | undefined> | undefined;
  projectedContext: SSRContext | undefined;
  hostCtx: QContext | undefined;
  invocationContext?: InvokeContext | undefined;
  $contexts$: QContext[];
  headNodes: JSXNode[];
}

export interface RenderSSROptions {
  fragmentTagName?: string;
  stream: StreamWriter;
  base?: string;
  userContext?: Record<string, any>;
  url?: string;
  beforeContent?: JSXNode[];
  beforeClose?: (contexts: QContext[], containerState: ContainerState) => Promise<JSXNode>;
}

/**
 * @alpha
 */
export const renderSSR = async (doc: Document, node: JSXNode, opts: RenderSSROptions) => {
  const root = opts.fragmentTagName ?? 'html';
  const containerEl = doc.createElement(root);
  const containerState = getContainerState(containerEl);
  const rctx = createRenderContext(doc, containerState);
  const ssrCtx: SSRContext = {
    rctx,
    $contexts$: [],
    projectedChildren: undefined,
    projectedContext: undefined,
    hostCtx: undefined,
    invocationContext: undefined,
    headNodes: [getBaseStyles()],
  };
  const beforeContent = opts.beforeContent;
  const beforeClose = opts.beforeClose;
  if (beforeContent) {
    ssrCtx.headNodes.push(...beforeContent);
  }
  const containerAttributes: Record<string, string> = {
    'q:container': 'paused',
    'q:version': version ?? 'dev',
    'q:render': 'ssr',
  };
  if (opts.base) {
    containerAttributes['q:base'] = opts.base;
  }
  if (opts.url) {
    containerState.$userContext$['url'] = opts.url;
  }
  if (opts.userContext) {
    Object.assign(containerState.$userContext$, opts.userContext);
  }

  if (opts.fragmentTagName) {
    node = jsx(root, {
      ...containerAttributes,
      children: [...ssrCtx.headNodes, node],
    });
    await renderNode(node, ssrCtx, opts.stream, 0, (stream) => {
      const result = beforeClose?.(ssrCtx.$contexts$, containerState);
      if (result) {
        return processData(result, ssrCtx, stream, 0, undefined);
      }
    });
  } else {
    const elCtx = getContext(containerEl);
    await renderRootNode(node, elCtx, containerAttributes, ssrCtx, opts.stream, 0, () =>
      beforeClose?.(ssrCtx.$contexts$, containerState)
    );
  }
};

export const renderRootNode = (
  node: JSXNode<any>,
  elCtx: QContext,
  containerAttributes: Record<string, string | undefined>,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: () => ValueOrPromise<any>
): ValueOrPromise<void> => {
  if (isArray(node)) {
    if (node.length !== 1) {
      throw qError(QError_rootNodeMustBeHTML, node);
    }
    return renderRootNode(node[0], elCtx, containerAttributes, ssrCtx, stream, flags, beforeClose);
  }
  if (typeof node.type === 'string') {
    if (node.type !== 'html') {
      throw qError(QError_rootNodeMustBeHTML, node);
    }
    return renderNodeElement(
      node,
      elCtx,
      containerAttributes,
      undefined,
      ssrCtx,
      stream,
      flags,
      beforeClose
    );
  } else {
    const result = node.type(node.props, node.key);
    return renderRootNode(result, elCtx, containerAttributes, ssrCtx, stream, flags, beforeClose);
  }
};
const IS_HOST = 1 << 0;
const IS_HEAD = 1 << 1;
const IS_RAW_CONTENT = 1 << 2;

export const renderNodeFunction = (
  node: JSXNode<any>,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
) => {
  const res = ssrCtx.invocationContext
    ? useInvoke(ssrCtx.invocationContext, () => node.type(node.props, node.key))
    : node.type(node.props, node.key);
  return processData(res, ssrCtx, stream, flags, beforeClose);
};

export const renderNodeElement = (
  node: JSXNode<string>,
  elCtx: QContext,
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
  const renderQrl = props[OnRenderProp];

  const hasRef = 'ref' in props;
  const isHost = flags & IS_HOST;
  const insideHead = flags & IS_HEAD;
  const attributes = updateProperties(ssrCtx.rctx, elCtx, props);
  const hasEvents = elCtx.$listeners$;
  if (key != null) {
    attributes['q:key'] = key;
  }
  if (isHost || hasRef || hasEvents) {
    const newID = getNextIndex(ssrCtx.rctx);
    attributes[ELEMENT_ID] = newID;
    elCtx.$id$ = newID;
    ssrCtx.$contexts$.push(elCtx);
  }
  if (insideHead) {
    attributes['q:head'] = '';
  }
  if (extraAttributes) {
    Object.assign(attributes, extraAttributes);
  }
  if (isHost) {
    if (elCtx.$contexts$) {
      attributes[QCtxAttr] = serializeInlineContexts(elCtx.$contexts$);
    }
  } else {
    if (ssrCtx.hostCtx) {
      attributes['class'] = joinClasses(ssrCtx.hostCtx.$scopeIds$, attributes['class']);
    }
  }
  if (elCtx.$listeners$) {
    elCtx.$listeners$.forEach((value, key) => {
      attributes[fromCamelToKebabCase(key)] = serializeQRLs(value, elCtx);
    });
  }
  if (renderQrl) {
    elCtx.$renderQrl$ = renderQrl;
    return renderSSRComponent(ssrCtx, stream, elCtx, node, attributes, flags, beforeClose);
  }
  const slotName = props[QSlotName];
  const isSlot = typeof slotName === 'string';
  if (isSlot) {
    assertDefined(ssrCtx.hostCtx?.$id$, 'hostId must be defined for a slot');
    attributes[QSlotRef] = ssrCtx.hostCtx.$id$;
  }

  if (renderNodeElementSync(textType, attributes, stream)) {
    return;
  }

  // Reset HOST flags
  flags = 0;

  if (textType === 'head') {
    flags |= IS_HEAD;
  }
  if (hasRawContent[textType]) {
    flags |= IS_RAW_CONTENT;
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
    }
    // Fast path
    if (!isSlot && !beforeClose) {
      stream.write(`</${textType}>`);
      return;
    }

    let promise: ValueOrPromise<void>;
    if (isSlot) {
      const content = ssrCtx.projectedChildren?.[slotName];
      if (content) {
        ssrCtx.projectedChildren![slotName] = undefined;
        promise = processData(content, ssrCtx.projectedContext!, stream, flags);
      }
    }

    // Inject before close
    if (beforeClose) {
      promise = then(promise, () =>
        then(beforeClose(stream), (jsx) => {
          return processData(jsx, ssrCtx, stream, flags);
        })
      );
    }

    return then(promise, () => {
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
  node: JSXNode<string>,
  attributes: Record<string, string>,
  flags: number,
  beforeClose?: (stream: StreamWriter) => ValueOrPromise<void>
): ValueOrPromise<void> => {
  return then(executeComponent(ssrCtx.rctx, elCtx), (res) => {
    if (res) {
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
      const invocationContext = newInvokeContext(newCtx.$doc$, hostElement, hostElement);
      invocationContext.$subscriber$ = hostElement;
      invocationContext.$renderCtx$ = newCtx;
      const projectedContext: SSRContext = {
        ...ssrCtx,
        rctx: copyRenderContext(newCtx),
      };
      const newSSrContext: SSRContext = {
        ...ssrCtx,
        projectedChildren: splitProjectedChildren(children, ssrCtx),
        projectedContext,
        rctx: newCtx,
        invocationContext,
      };

      const extraNodes = [];
      const styleClasses = [];
      if (elCtx.$appendStyles$) {
        for (const style of elCtx.$appendStyles$) {
          extraNodes!.push(
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
      const processedNode = jsx(node.type, {
        ...attributes,
        class: joinClasses(attributes['class'], styleClasses),
      });

      if (res.node) {
        if (res.node.type === Host) {
          processedNode.props = {
            ...attributes,
            ...res.node.props,
            class: joinClasses(processedNode.props.class, res.node.props.class),
          };
        } else {
          processedNode.props['children'] = res.node;
        }
      }

      flags |= IS_HOST;
      newSSrContext.hostCtx = elCtx;

      return renderNodeElement(
        processedNode,
        elCtx,
        undefined,
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
    }
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
  if (node.type === SSRComment) {
    stream.write(`<!--${node.props.data ?? ''}-->`);
  } else if (typeof node.type === 'string') {
    const elCtx = getContext(ssrCtx.rctx.$doc$.createElement(node.type));
    return renderNodeElement(
      node as any,
      elCtx,
      undefined,
      undefined,
      ssrCtx,
      stream,
      flags,
      beforeClose
    );
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
  } else if (isJSXNode(children) && isFunction(children.type) && children.type !== SSRComment) {
    const fn = children.type;
    const res = ssrCtx.invocationContext
      ? useInvoke(ssrCtx.invocationContext, () => fn(children.props, children.key))
      : fn(children.props, children.key);
    return flatVirtualChildren(res, ssrCtx);
  }
  return children;
};

const updateProperties = (
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
  const elm = ctx.$element$;
  const isCmp = OnRenderProp in expectProps;
  const qwikProps = isCmp ? getPropsMutator(ctx, rctx.$containerState$) : undefined;
  for (let key of keys) {
    if (key === 'children' || key === OnRenderProp) {
      continue;
    }
    const newValue = expectProps[key];
    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm;
      continue;
    }

    // Early exit if value didnt change
    // Check of data- or aria-
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      attributes[key] = newValue;
      continue;
    }

    if (qwikProps) {
      const skipProperty = ALLOWS_PROPS.includes(key);
      const hasPrefix = SCOPE_PREFIX.test(key);
      if (!skipProperty && !hasPrefix) {
        // Qwik props
        qwikProps.set(key, newValue);
        continue;
      }
      const hPrefixed = key.startsWith(HOST_PREFIX);
      if (hPrefixed) {
        key = key.slice(HOST_PREFIX.length);
      }
    } else if (qDev && key.startsWith(HOST_PREFIX)) {
      logWarn(`${HOST_PREFIX} prefix can not be used in non components`);
      continue;
    }

    if (isOnProp(key)) {
      const attributeName = normalizeOnProp(key.slice(0, -1));
      addQRLListener(ctx, attributeName, newValue);
      continue;
    }

    // Check if its an exception
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

const getBaseStyles = () => {
  return jsx('style', {
    id: 'qwik/base-styles',
    dangerouslySetInnerHTML: BASE_QWIK_STYLES,
  });
};
