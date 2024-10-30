/* eslint-disable no-console */
import type {
  JSXOutput,
  _ContainerElement,
  _DomContainer,
  _VNode,
  _VirtualVNode,
} from '@qwik.dev/core';
import { Slot, _getDomContainer, componentQrl, render, type OnRenderFn } from '@qwik.dev/core';
import { expect } from 'vitest';
import {
  vnode_getAttr,
  vnode_getFirstChild,
  vnode_getParent,
  vnode_getVNodeForChildNode,
  vnode_locate,
  vnode_toString,
} from '../core/client/vnode';
import { ERROR_CONTEXT } from '../core/shared/error/error-handling';
import type { Props } from '../core/shared/jsx/jsx-runtime';
import { getPlatform, setPlatform } from '../core/shared/platform/platform';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { ChoreType } from '../core/shared/scheduler';
import { dumpState } from '../core/shared/shared-serialization';
import {
  ELEMENT_PROPS,
  OnRenderProp,
  QContainerSelector,
  QFuncsPrefix,
  QInstanceAttr,
  QScopedStyle,
  QStyle,
} from '../core/shared/utils/markers';
import { useContextProvider } from '../core/use/use-context';
import type { HostElement, QRLInternal } from '../server/qwik-types';
import { Q_FUNCS_PREFIX, renderToString } from '../server/ssr-render';
import { createDocument } from './document';
import { getTestPlatform } from './platform';
import './vdom-diff.unit-util';

/** @public */
export async function domRender(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    document?: Document;
  } = {}
) {
  const doc = opts.document || document;
  await render(doc.body, jsx);
  await getTestPlatform().flush();
  const getStyles = getStylesFactory(doc);
  const container = _getDomContainer(doc.body);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- CSR --------------------------');
    console.log(container.rootVNode.toString());
    renderStyles(getStyles);
    console.log('--------------------------------------------------------');
  }
  return {
    document: doc,
    container,
    vNode: vnode_getFirstChild(container.rootVNode),
    getStyles: getStylesFactory(doc),
  };
}

function getStylesFactory(document: Document) {
  return () => {
    const styles: Record<string, string | string[]> = {};
    Array.from(document.querySelectorAll('style')).forEach((style) => {
      const id = style.hasAttribute(QStyle)
        ? style.getAttribute(QStyle)
        : style.getAttribute(QScopedStyle)
          ? style.getAttribute(QScopedStyle)
          : null;
      if (id !== null) {
        const text = style.textContent!;
        if (id in styles) {
          const existing = styles[id];
          Array.isArray(existing) ? existing.push(text) : (styles[id] = [existing, text]);
        } else {
          styles[id] = text;
        }
      }
    });
    return styles;
  };
}

/** @public */
export async function ssrRenderToDom(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    /// Treat JSX as raw, (don't wrap in in head/body)
    raw?: boolean;
  } = {}
) {
  let html = '';
  const platform = getPlatform();
  try {
    const jsxToRender = opts.raw
      ? jsx
      : [
          <head>
            <title>{expect.getState().testPath}</title>
          </head>,
          <body>{jsx}</body>,
        ];
    const result = await renderToString(jsxToRender);
    html = result.html;
  } finally {
    setPlatform(platform);
  }

  const doc = createDocument({ html });
  const containerElement = doc.querySelector('[q\\:container]') as _ContainerElement;
  emulateExecutionOfQwikFuncs(doc);
  const container = _getDomContainer(containerElement) as _DomContainer;
  const getStyles = getStylesFactory(doc);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- SSR --------------------------');
    console.log(html);
    renderStyles(getStyles);
    console.log('--------------------------------------------------------');
    console.log(vnode_toString.call(container.rootVNode, Number.MAX_SAFE_INTEGER, '', true));
    console.log('------------------- SERIALIZED STATE -------------------');
    // We use the original state so we don't get deserialized data
    const origState = container.element.querySelector('script[type="qwik/state"]')?.textContent;
    console.log(
      origState ? dumpState(JSON.parse(origState), true, '', null) : 'No state found',
      '\n'
    );
    const funcs = container.$qFuncs$;
    console.log('------------------- SERIALIZED QFUNCS -------------------');
    for (let i = 0; i < funcs.length; i++) {
      console.log(('    ' + i + ':').substring(-4), funcs[i].toString());
    }
    console.log('---------------------------------------------------------');
  }
  const containerVNode = opts.raw
    ? container.rootVNode
    : vnode_getVNodeForChildNode(container.rootVNode, doc.body);
  return { container, document: doc, vNode: vnode_getFirstChild(containerVNode)!, getStyles };
}

function renderStyles(getStyles: () => Record<string, string | string[]>) {
  const START = '\x1b[34m';
  const END = '\x1b[0m';
  Object.entries(getStyles()).forEach(([key, value], idx) => {
    if (idx == 0) {
      console.log('-  -  -  -  -  -  -  <style>  -  -  -  -  -  -  -  -  -');
    }
    console.log(START + key + ': ' + END + value);
  });
}

export async function rerenderComponent(element: HTMLElement) {
  const container = _getDomContainer(element);
  const vElement = vnode_locate(container.rootVNode, element);
  const host = getHostVNode(vElement) as HostElement;
  const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp)!;
  const props = container.getHostProp<Props>(host, ELEMENT_PROPS);
  await container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
  await getTestPlatform().flush();
}

function getHostVNode(vElement: _VNode | null) {
  while (vElement != null) {
    if (vnode_getAttr(vElement, OnRenderProp) != null) {
      return vElement as _VirtualVNode;
    }
    vElement = vnode_getParent(vElement);
  }
  return vElement;
}

/** @public */
export function emulateExecutionOfQwikFuncs(document: Document) {
  const qFuncs = document.body.querySelector('[q\\:func]');
  const containerElement = document.querySelector(QContainerSelector) as _ContainerElement;
  const hash = containerElement.getAttribute(QInstanceAttr);
  if (qFuncs && hash) {
    let code = qFuncs.textContent || '';
    code = code.replace(Q_FUNCS_PREFIX.replace('HASH', hash), '');
    if (code) {
      (document as any)[QFuncsPrefix + hash] = eval(code);
    }
  }
}

export const ErrorProvider = Object.assign(
  componentQrl(
    inlinedQrl(() => {
      (ErrorProvider as any).error = null;
      useContextProvider(ERROR_CONTEXT, ErrorProvider as any);
      return <Slot />;
    }, 's_ErrorProvider')
  ),
  { error: null as any }
);
