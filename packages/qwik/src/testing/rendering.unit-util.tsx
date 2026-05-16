/* eslint-disable no-console */
import {
  Slot,
  componentQrl,
  inlinedQrl,
  render,
  getPlatform,
  setPlatform,
  type JSXOutput,
} from '@qwik.dev/core';
import {
  _getDomContainer,
  _vnode_getElementName,
  _vnode_getFirstChild,
  _vnode_getProp,
  _vnode_getVNodeForChildNode,
  _vnode_insertBefore,
  _vnode_isElementVNode,
  _vnode_isVirtualVNode,
  _vnode_newVirtual,
  _vnode_remove,
  _vnode_setProp,
  _vnode_toString,
} from '@qwik.dev/core/internal';
import type {
  _ContainerElement,
  _DomContainer,
  _VNode,
  _VirtualVNode,
  _VNodeJournal,
} from '@qwik.dev/core/internal';
import { expect } from 'vitest';
import { ERROR_CONTEXT } from '../core/shared/error/error-handling';
import { _dumpState, _preprocessState as preprocessState } from '@qwik.dev/core/internal';
import {
  OnRenderProp,
  QContainerSelector,
  QScopedStyle,
  QStyle,
} from '../core/shared/utils/markers';
import { useContextProvider } from '@qwik.dev/core';
import { DEBUG_TYPE, ELEMENT_BACKPATCH_DATA, VirtualType } from '../server/qwik-copy';
import type { HostElement } from '../server/qwik-types';
import { renderToString } from '../server/ssr-render';
import { createDocument } from './document';
import './vdom-diff.unit-util';
import type { VNode } from '../core/shared/vnode/vnode';
import type { VirtualVNode } from '../core/shared/vnode/virtual-vnode';
import { ChoreBits } from '../core/shared/vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../core/shared/vnode/vnode-dirty';
import type { ElementVNode } from '../core/shared/vnode/element-vnode';
import { executeBackpatch } from '../backpatch-executor-shared';
import { getTestPlatform } from '@qwik.dev/core/testing';

/** @public */
export async function domRender(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
  } = {}
) {
  setPlatform(getTestPlatform());
  const document = createDocument();
  await render(document.body, jsx);
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
    vNode: _vnode_getFirstChild(container.rootVNode),
    getStyles: getStylesFactory(document),
  };
}

function getStylesFactory(document: Document) {
  return () => {
    const styles: Record<string, string | string[]> = {};
    const styleElements = document.querySelectorAll('style');
    for (let i = 0; i < styleElements.length; i++) {
      const style = styleElements[i];
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
    }
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
    /** Inject nodes into the document before test runs (for testing purposes) */
    onBeforeResume?: (document: Document) => void;
  } = {}
) {
  setPlatform(getTestPlatform());
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

  if (opts.onBeforeResume) {
    opts.onBeforeResume(document);
  }

  emulateExecutionOfBackpatch(document);
  const container = _getDomContainer(containerElement) as _DomContainer;
  const getStyles = getStylesFactory(document);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- SSR --------------------------');
    console.log(html);
    renderStyles(getStyles);
    console.log('--------------------------------------------------------');
    console.log(_vnode_toString.call(container.rootVNode, Number.MAX_SAFE_INTEGER, '', true));
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
    : _vnode_getVNodeForChildNode(container.rootVNode, document.body);

  const firstContainerChild = _vnode_getFirstChild(containerVNode);

  const journal: _VNodeJournal = [];
  let vNode: VNode | null = null;
  if (!firstContainerChild) {
    // No children, so we can't get the first child
    vNode = null;
  } else if (!_vnode_isVirtualVNode(firstContainerChild)) {
    // First child is an element or a text, so we can't just use it as the vNode, because it might have siblings.
    // We need to wrap it in a fragment.

    // Create a fragment
    const fragment = _vnode_newVirtual();
    _vnode_setProp(fragment, DEBUG_TYPE, VirtualType.Fragment);

    const childrenToMove = [];

    // Add all children to the fragment up to the script tag
    let child: VNode | null = firstContainerChild;
    let insertBefore: VNode | null = null;
    while (child) {
      // Stop when we reach the state script tag
      if (
        _vnode_isElementVNode(child) &&
        (isQwikScript(child) || _vnode_getElementName(child) === 'q:template')
      ) {
        insertBefore = child;
        break;
      }
      childrenToMove.push(child);
      child = child.nextSibling as VNode | null;
    }

    // Set the container vnode as a parent of the fragment
    _vnode_insertBefore(journal, containerVNode, fragment, insertBefore);
    // Set the fragment as a parent of the children
    for (let i = 0; i < childrenToMove.length; i++) {
      const child = childrenToMove[i];
      _vnode_moveToVirtual(fragment, child, null);
    }
    vNode = fragment;
  } else {
    vNode = firstContainerChild;
  }

  if (journal.length > 0) {
    throw new Error('Journal not empty after moving nodes to fragment.');
  }

  return { container, document, vNode, getStyles };
}

function isQwikScript(node: ElementVNode): boolean {
  const element = node.node;
  return (
    _vnode_getElementName(node) === 'script' &&
    (_vnode_getProp(node, 'type', null) === 'qwik/state' ||
      _vnode_getProp(node, 'type', null) === ELEMENT_BACKPATCH_DATA ||
      _vnode_getProp(node, 'id', null) === 'qwikloader' ||
      element.getAttribute('type') === 'qwik/state' ||
      element.getAttribute('type') === ELEMENT_BACKPATCH_DATA ||
      element.getAttribute('id') === 'qwikloader' ||
      element.innerHTML.includes('window._qwikEv'))
  );
}

function _vnode_moveToVirtual(parent: VirtualVNode, newChild: VNode, insertBefore: VNode | null) {
  const journal: _VNodeJournal = [];
  // ensure that the previous node is unlinked.
  const newChildCurrentParent = newChild.parent;
  if (newChildCurrentParent && (newChild.previousSibling || newChild.nextSibling)) {
    _vnode_remove(journal, newChildCurrentParent as ElementVNode | VirtualVNode, newChild, false);
  }
  if (journal.length > 0) {
    throw new Error('Journal not empty after removing node.');
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
  const qFuncs = document.body.querySelectorAll('[q\\:func]');
  for (let i = 0; i < qFuncs.length; i++) {
    const code = qFuncs[i].textContent || '';
    if (code) {
      eval(code);
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

  // Use the shared backpatch executor function
  executeBackpatch(document);
}

function renderStyles(getStyles: () => Record<string, string | string[]>) {
  const START = '\x1b[34m';
  const END = '\x1b[0m';
  // eslint-disable-next-line qwik-local/loop-style
  Object.entries(getStyles()).forEach(([key, value], idx) => {
    if (idx == 0) {
      console.log('-  -  -  -  -  -  -  <style>  -  -  -  -  -  -  -  -  -');
    }
    console.log(START + key + ': ' + END + value);
  });
}

export async function rerenderComponent(element: HTMLElement) {
  const container = _getDomContainer(element) as _DomContainer;
  const vElement = container.vNodeLocate(element);
  const host = getHostVNode(vElement) as HostElement;
  markVNodeDirty(container, host, ChoreBits.COMPONENT);
}

function getHostVNode(vElement: _VNode | null) {
  while (vElement != null) {
    if (_vnode_getProp(vElement, OnRenderProp, null) != null) {
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
