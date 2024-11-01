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
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getParent,
  vnode_getVNodeForChildNode,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newVirtual,
  vnode_setProp,
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
import type { VNode } from '../core/client/types';
import { DEBUG_TYPE, VirtualType } from '../server/qwik-copy';

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
    : vnode_getVNodeForChildNode(container.rootVNode, document.body);

  const firstContainerChild = vnode_getFirstChild(containerVNode);

  let vNode: VNode | null = null;
  if (!firstContainerChild) {
    // No children, so we can't get the first child
    vNode = null;
  } else if (!vnode_isVirtualVNode(firstContainerChild)) {
    // First child is an element or a text, so we can't just use it as the vNode, because it might have siblings.
    // We need to wrap it in a fragment.

    // Create a fragment
    const fragment = vnode_newVirtual();
    vnode_setProp(fragment, DEBUG_TYPE, VirtualType.Fragment);

    const childrenToMove = [];

    // Add all children to the fragment up to the script tag
    let child: VNode | null = firstContainerChild;
    while (child) {
      // Stop when we reach the state script tag
      if (
        vnode_isElementVNode(child) &&
        ((vnode_getElementName(child) === 'script' &&
          vnode_getAttr(child, 'type') === 'qwik/state') ||
          vnode_getElementName(child) === 'q:template')
      ) {
        break;
      }
      childrenToMove.push(child);
      child = vnode_getNextSibling(child);
    }

    // Set the container vnode as a parent of the fragment
    vnode_insertBefore(container.$journal$, containerVNode, fragment, null);
    // Set the fragment as a parent of the children
    for (const child of childrenToMove) {
      vnode_insertBefore(container.$journal$, fragment, child, null);
    }
    vNode = fragment;
  } else {
    vNode = firstContainerChild;
  }

  return { container, document, vNode, getStyles };
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
