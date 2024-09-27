/* eslint-disable no-console */
import { expect } from 'vitest';
import { Q_FUNCS_PREFIX } from '../server/ssr-render';
import { createDocument } from './document';
import { getTestPlatform } from './platform';
import { _getDomContainer, componentQrl, type OnRenderFn } from '@qwikdev/core';
import type {
  JSXOutput,
  _DomContainer,
  _ContainerElement,
  _VNode,
  _VirtualVNode,
} from '@qwikdev/core';
import { getPlatform, setPlatform } from '../core/shared/platform/platform';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { ERROR_CONTEXT } from '../core/shared/error/error-handling';
import { Slot } from '../core/shared/jsx/slot.public';
import { useContextProvider } from '../core/use/use-context';
import {
  ELEMENT_PROPS,
  OnRenderProp,
  QContainerSelector,
  QFuncsPrefix,
  QInstanceAttr,
  QScopedStyle,
  QStyle,
} from '../core/shared/utils/markers';
import { render } from '../core/client/dom-render';
import {
  vnode_getAttr,
  vnode_getFirstChild,
  vnode_getParent,
  vnode_getVNodeForChildNode,
  vnode_isVNode,
  vnode_locate,
  vnode_toString,
} from '../core/client/vnode';
import { codeToName } from '../core/shared/shared-serialization';
import './vdom-diff.unit-util';
import { renderToString } from '../server/ssr-render';
import { ChoreType } from '../core/shared/scheduler';
import type { Props } from '../core/shared/jsx/jsx-runtime';
import type { HostElement, QRLInternal } from '../server/qwik-types';

/** @public */
export async function domRender(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
  } = {}
) {
  const document = createDocument();
  await render(document.body, jsx);
  await getTestPlatform().flush();
  const getStyles = getStylesFactory(document);
  const container = _getDomContainer(document.body);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- CSR --------------------------');
    console.log(container.rootVNode.toString());
    renderStyles(getStyles);
    console.log('--------------------------------------------------------');
  }
  return {
    document,
    container,
    vNode: vnode_getFirstChild(container.rootVNode),
    getStyles: getStylesFactory(document),
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

  const document = createDocument({ html });
  const containerElement = document.querySelector('[q\\:container]') as _ContainerElement;
  emulateExecutionOfQwikFuncs(document);
  const container = _getDomContainer(containerElement) as _DomContainer;
  const getStyles = getStylesFactory(document);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- SSR --------------------------');
    console.log(html);
    renderStyles(getStyles);
    console.log('--------------------------------------------------------');
    console.log(vnode_toString.call(container.rootVNode, Number.MAX_SAFE_INTEGER, '', true));
    console.log('------------------- SERIALIZED STATE -------------------');
    const state = container.$rawStateData$;
    for (let i = 0; i < state.length; i++) {
      console.log(('    ' + i + ':').substring(-4), qwikJsonStringify(state[i]));
    }
    const funcs = container.$qFuncs$;
    for (let i = 0; i < funcs.length; i++) {
      console.log(('    ' + i + ':').substring(-4), funcs[i].toString());
    }
    if (false as boolean) {
      // stateDate is private but it's not enforced so we can access it for the test
      const proxyState = (container as any).stateData;
      for (let i = 0; i < state.length; i++) {
        console.log(('    ' + i + ':').substring(-4), proxyState[i]);
      }
    }
    console.log('--------------------------------------------------------');
  }
  const containerVNode = opts.raw
    ? container.rootVNode
    : vnode_getVNodeForChildNode(container.rootVNode, document.body);
  return { container, document, vNode: vnode_getFirstChild(containerVNode)!, getStyles };
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

function qwikJsonStringify(value: any): string {
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  if (vnode_isVNode(value)) {
    return vnode_toString.call(value, 1, '', true).replaceAll(/\n.*/gm, '');
  } else {
    let json = JSON.stringify(value);
    json = json.replace(/"\\u00([0-9a-f][0-9a-f])/gm, (_, value) => {
      return '"' + RED + codeToName(parseInt(value, 16)) + ': ' + RESET;
    });
    return json;
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
