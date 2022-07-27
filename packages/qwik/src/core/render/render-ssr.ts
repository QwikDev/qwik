import {  ALLOWS_PROPS, createRenderContext, HOST_PREFIX, RenderContext, SCOPE_PREFIX, splitBy, stringifyClassOrStyle } from './cursor';
import { isNotNullable, isPromise, then } from '../util/promises';
import { InvokeContext, newInvokeContext, useInvoke } from '../use/use-core';
import { isJSXNode, jsx, jsxs } from './jsx/jsx-runtime';
import { isArray, isFunction, isString, ValueOrPromise } from '../util/types';
import { getContext, getPropsMutator, QContext, setEvent } from '../props/props';
import type { JSXNode } from './jsx/types/jsx-node';
import { executeComponent } from './render-component';
import { qError, QError_invalidJsxNodeType } from '../error/error';
import { OnRenderProp, QSlot } from '../util/markers';
import { Host } from './jsx/host.public';
import { qDev } from '../util/qdev';
import { logWarn } from '../util/log';
import { isOnProp } from '../props/props-on';
import type { StreamWriter } from '../../server/types';
import type { Ref } from '../use/use-store.public';
import { version } from '../version';
import { ContainerState, getContainerState } from './notify-render';



export interface SSRContext {
  rctx: RenderContext,
  projectedChildren?: any[],
  invocationContext?: InvokeContext;
}

export interface RenderSSROptions {
  root?: string;
  stream: StreamWriter;
  base?: string;
  beforeClose?: (containerState: ContainerState) => Promise<JSXNode>;
}

export const renderSSR = async (
  doc: Document,
  node: JSXNode,
  opts: RenderSSROptions,
) => {
  let containerEl: Element;
  if (opts.root) {
    containerEl = doc.createElement(opts.root);
    node = jsx(opts.root, {
      'q:container': 'paused',
      'q:version': version,
      'q:base': opts.base,
      children: node,
    })
  } else {
    containerEl = doc.createElement('html');
  }

  const containerState = getContainerState(containerEl);
  const rctx = createRenderContext(doc, containerState);
  const ssrCtx: SSRContext = {
    rctx
  };
  await renderNode(node, ssrCtx, opts.stream, false);
}

export const renderNode = (
  node: JSXNode,
  ssrCtx: SSRContext,
  stream: StreamWriter,
  isHost: boolean
): ValueOrPromise<void> => {
  const key = node.key != null ? String(node.key) : null;
  let textType = '';
  const props = node.props;
  if (isFunction(node.type)) {
    const res = ssrCtx.invocationContext
      ? useInvoke(ssrCtx.invocationContext, () => node.type(node.props, node.key))
      : node.type(node.props, node.key);
    return processData(res, ssrCtx, stream);
  } else if (isString(node.type)) {
    textType = node.type;
  } else {
    throw qError(QError_invalidJsxNodeType, node.type);
  }
  const renderQrl = props[OnRenderProp];
  const el = (textType === 'html')
    ? ssrCtx.rctx.$containerEl$
    : ssrCtx.rctx.$doc$.createElement(textType);

  const elCtx = getContext(el);
  const attributes = updateProperties(ssrCtx.rctx, elCtx, props, false);
  if (textType === 'html') {
    attributes['q:container'] = 'paused';
    attributes['q:version'] = version;
  }
  if (key) {
    attributes['q:key'] = key;
  }
  if (renderQrl) {
    elCtx.$renderQrl$ = renderQrl;
    return renderSSRComponent(ssrCtx, stream, elCtx, node, attributes);
  }

  stream.write(`<${textType}`);
  Object.entries(attributes).forEach(([key, value]) => {
    const chunk = value === ''
      ? ` ${key}`
      : ` ${key}=${JSON.stringify(value)}`;

    stream.write(chunk);
  });
  const empty = !!emptyElements[textType];

  if (empty) {
    stream.write(`/>`);
  } else {
    stream.write(`>`);
    let children = props.children;
    if (ssrCtx.projectedChildren) {
      if (textType === QSlot) {
        children = mergeChildren(props.children, ssrCtx.projectedChildren);
        ssrCtx.projectedChildren = undefined;
      } else if (isHost) {
        children = mergeChildren(props.children, jsx('q:template', {
          children: ssrCtx.projectedChildren
        }));
      }
    }
    const promise = walkChildren(children, ssrCtx, stream);
    return then(promise, () => {
      if (textType === QSlot && ssrCtx.projectedChildren) {
        walkChildren(ssrCtx.projectedChildren, ssrCtx, stream);
      }
      stream.write(`</${textType}>`)
    });
  }
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
}

export const renderSSRComponent = (
  ssrCtx: SSRContext,
  stream: StreamWriter,
  elCtx: QContext,
  node: JSXNode<string>,
  attributes: Record<string, string>
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
      const newSSrContext: SSRContext = {
        ...ssrCtx,
        projectedChildren: children,
        rctx: newCtx,
      };
      const invocatinContext = newInvokeContext(newSSrContext.rctx.$doc$, hostElement, hostElement);
      invocatinContext.$subscriber$ = hostElement;
      invocatinContext.$renderCtx$ = newCtx;

      const processedNode = jsx(node.type, {
        ...attributes,
      });
      if (res.node.type === Host) {
        processedNode.props = {
          ...attributes,
          ...res.node.props,
          ['q:host']: '',
        }
      } else {
        processedNode.props['children'] = res.node;
      }
      return renderNode(processedNode, newSSrContext, stream, true);
    }
  });
}

const getSlotName = (node: JSXNode): string => {
  return node.props?.[QSlot] ?? '';
};




export const processData = (
  node: any,
  ssrCtx: SSRContext,
  stream: StreamWriter
): ValueOrPromise<void> => {
  if (node == null || typeof node === 'boolean') {
    return;
  }
  if (isJSXNode(node)) {
    return renderNode(node, ssrCtx, stream, false);
  } else if (isPromise(node)) {
    return node.then((node) => processData(node, ssrCtx, stream));
  } else if (isArray(node)) {
    return walkChildren(node.flat(100), ssrCtx, stream);
  } else if (isString(node) || typeof node === 'number') {
    stream.write(String(node));
  } else {
    logWarn('A unsupported value was passed to the JSX, skipping render. Value:', node);
  }
};

function walkChildren(children: any, ssrContext: SSRContext, stream: StreamWriter): ValueOrPromise<void> {
  let currentIndex = 0;
  children = isArray(children) ? children : [children];
  let prevPromise: ValueOrPromise<void> = undefined;
  for (let i = 0; i < children.length; i++) {
    const index = i;
    const child = children[index]
    const buffer: string[] = [];
    const localStream: StreamWriter = {
      write(chunk) {
        if (currentIndex === index) {
          stream.write(chunk)
        } else {
          buffer.push(chunk);
        }
      }
    };
    const p: ValueOrPromise<void> = prevPromise;
    prevPromise = then(processData(child, ssrContext, localStream), () => {
      return then(p, () => {
        buffer.forEach(stream.write);
        currentIndex++;
      })
    });
  }
  return prevPromise;
}

const updateProperties = (
  rctx: RenderContext,
  ctx: QContext,
  expectProps: Record<string, any> | null,
  isSvg: boolean,
) => {
  if (!expectProps) {
    return {};
  }
  const elm = ctx.$element$;
  const isCmp = OnRenderProp in expectProps;
  const qwikProps = isCmp ? getPropsMutator(ctx, rctx.$containerState$) : undefined;
  const attributes: Record<string, string> = {};
  for (let key of Object.keys(expectProps)) {
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
      setEvent(rctx, ctx, key, newValue);
      continue;
    }

    // Check if its an exception
    setProperty(attributes, key, newValue, isSvg);
  }
  return attributes;
};


function setProperty(attributes: Record<string, string>, prop: string, value: any, isSvg: boolean) {
  if (isSvg) {
    attributes[prop] = String(value);
  } else {
    if (value != null && value !== false) {
      prop = processPropKey(prop);
      const attrValue = processPropValue(prop, value);
      if (attrValue !== null) {
        attributes[prop] = attrValue;
      }
    }
  }
}

function processPropKey(prop: string) {
  if (prop === 'className') {
    return 'class';
  }
  return prop.toLowerCase();
}

function processPropValue(prop: string, value: any): string | null {
  if (prop === 'class') {
    return stringifyClassOrStyle(value, true);
  }
  if (prop === 'style') {
    return stringifyClassOrStyle(value, false);
  }
  if (value === false || value == null) {
    return null;
  }
  if (value === true) {
    return ''
  }
  return String(value);
}


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

export function createEl(tagName: string, doc: Document) {
  return {
    nodeType: 1,
    nodeName: tagName.toUpperCase,
    localName: tagName,
    ownerDocument: doc,
  };
}

export interface ServerDocument {
  nodeType: 9,
  parentElement: null,
  ownerDocument: null,
  createElement(tagName: string): any;
}
