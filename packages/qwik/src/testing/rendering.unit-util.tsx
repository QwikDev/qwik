/* eslint-disable no-console */
import { Slot, componentQrl, render, type JSXOutput, type OnRenderFn } from '@qwik.dev/core';
import { _getDomContainer } from '@qwik.dev/core/internal';
import type {
  _ContainerElement,
  _DomContainer,
  _VNode,
  _VirtualVNode,
} from '@qwik.dev/core/internal';
import { transformSync } from 'esbuild';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { expect } from 'vitest';
import {
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getVNodeForChildNode,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newVirtual,
  vnode_remove,
  vnode_toString,
  type VNodeJournal,
} from '../core/client/vnode';
import type { VNode, VirtualVNode } from '../core/client/vnode-impl';
import { ERROR_CONTEXT } from '../core/shared/error/error-handling';
import type { Props } from '../core/shared/jsx/jsx-runtime';
import { getPlatform, setPlatform } from '../core/shared/platform/platform';
import { inlinedQrl } from '../core/shared/qrl/qrl';
import { _dumpState, preprocessState } from '../core/shared/serdes/index';
import { ChoreType } from '../core/shared/util-chore-type';
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
import { DEBUG_TYPE, ELEMENT_BACKPATCH_DATA, VirtualType } from '../server/qwik-copy';
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
    /** Print debug information to console. */
    debug?: boolean;
    /** Treat JSX as raw, (don't wrap in in head/body) */
    raw?: boolean;
    /** Include QwikLoader */
    qwikLoader?: boolean;
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
    const result = await renderToString(jsxToRender, {
      qwikLoader: opts.qwikLoader ? 'inline' : 'never',
    });
    html = result.html;
  } finally {
    setPlatform(platform);
  }

  const document = createDocument({ html });
  const containerElement = document.querySelector(QContainerSelector) as _ContainerElement;
  emulateExecutionOfQwikFuncs(document);
  emulateExecutionOfBackpatch(document);
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
    const origState = JSON.parse(
      container.element.querySelector('script[type="qwik/state"]')?.textContent || '[]'
    );
    preprocessState(origState, container);
    console.log(origState ? _dumpState(origState, true, '', null) : 'No state found', '\n');
    const funcs = container.$qFuncs$;
    console.log('------------------- SERIALIZED QFUNCS -------------------');
    for (let i = 0; i < funcs.length; i++) {
      console.log(('    ' + i + ':').substring(-4), funcs[i].toString());
    }
    const backpatchData = container.element.querySelector('script[type="qwik/backpatch"]');
    console.log('--------------- SERIALIZED BACKPATCH DATA ---------------');
    console.log('    ' + backpatchData?.textContent || 'No backpatch data found');
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
    fragment.setProp(DEBUG_TYPE, VirtualType.Fragment);

    const childrenToMove = [];

    // Add all children to the fragment up to the script tag
    let child: VNode | null = firstContainerChild;
    let insertBefore: VNode | null = null;
    while (child) {
      // Stop when we reach the state script tag
      if (
        vnode_isElementVNode(child) &&
        ((vnode_getElementName(child) === 'script' &&
          (child.getAttr('type') === 'qwik/state' ||
            child.getAttr('type') === ELEMENT_BACKPATCH_DATA ||
            child.getAttr('id') === 'qwikloader')) ||
          vnode_getElementName(child) === 'q:template')
      ) {
        insertBefore = child;
        break;
      }
      childrenToMove.push(child);
      child = child.nextSibling as VNode | null;
    }

    // Set the container vnode as a parent of the fragment
    vnode_insertBefore(container.$journal$, containerVNode, fragment, insertBefore);
    // Set the fragment as a parent of the children
    for (const child of childrenToMove) {
      vnode_moveToVirtual(container.$journal$, fragment, child, null);
    }
    vNode = fragment;
  } else {
    vNode = firstContainerChild;
  }

  return { container, document, vNode, getStyles };
}

function vnode_moveToVirtual(
  journal: VNodeJournal,
  parent: VirtualVNode,
  newChild: VNode,
  insertBefore: VNode | null
) {
  // ensure that the previous node is unlinked.
  const newChildCurrentParent = newChild.parent;
  if (newChildCurrentParent && (newChild.previousSibling || newChild.nextSibling)) {
    vnode_remove(journal, newChildCurrentParent, newChild, false);
  }

  // link newChild into the previous/next list
  const vNext = insertBefore;
  const vPrevious = vNext ? vNext.previousSibling : (parent.lastChild as VNode | null);
  if (vNext) {
    vNext.previousSibling = newChild;
  } else {
    parent.lastChild = newChild;
  }
  if (vPrevious) {
    vPrevious.nextSibling = newChild;
  } else {
    parent.firstChild = newChild;
  }
  newChild.previousSibling = vPrevious;
  newChild.nextSibling = vNext;
  newChild.parent = parent;
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

export function emulateExecutionOfBackpatch(document: Document) {
  // treewalker needs NodeFilter
  if (typeof NodeFilter === 'undefined') {
    (globalThis as any).NodeFilter = {
      SHOW_ELEMENT: 1,
      SHOW_ALL: -1,
      SHOW_ATTRIBUTE: 2,
      SHOW_TEXT: 4,
      SHOW_CDATA_SECTION: 8,
      SHOW_ENTITY_REFERENCE: 16,
      SHOW_ENTITY: 32,
      SHOW_PROCESSING_INSTRUCTION: 64,
      SHOW_COMMENT: 128,
      SHOW_DOCUMENT: 256,
      SHOW_DOCUMENT_TYPE: 512,
      SHOW_DOCUMENT_FRAGMENT: 1024,
      SHOW_NOTATION: 2048,
    };
  }

  // we need esbuild to transpile from ts to js for the test environment
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const tsPath = join(__dirname, '../backpatch-executor.ts');
  const tsSource = readFileSync(tsPath, 'utf8');

  const result = transformSync(tsSource, {
    loader: 'ts',
    target: 'es2020',
    format: 'esm',
    minify: false,
    sourcemap: false,
  });

  const code = `try {${result.code}} catch (e) { console.error(e); }`;
  const script = document.createElement('script');
  document.body.appendChild(script);
  (document as any).currentScript = script;
  try {
    eval(code);
  } finally {
    (document as any).currentScript = null;
    document.body.removeChild(script);
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

export async function rerenderComponent(element: HTMLElement, flush?: boolean) {
  const container = _getDomContainer(element);
  const vElement = vnode_locate(container.rootVNode, element);
  const host = getHostVNode(vElement) as HostElement;
  const qrl = container.getHostProp<QRLInternal<OnRenderFn<unknown>>>(host, OnRenderProp)!;
  const props = container.getHostProp<Props>(host, ELEMENT_PROPS);
  container.$scheduler$(ChoreType.COMPONENT, host, qrl, props);
  if (flush) {
    // Note that this can deadlock
    await getTestPlatform().flush();
  }
}

function getHostVNode(vElement: _VNode | null) {
  while (vElement != null) {
    if (vElement.getAttr(OnRenderProp) != null) {
      return vElement as _VirtualVNode;
    }
    vElement = vElement.parent;
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
