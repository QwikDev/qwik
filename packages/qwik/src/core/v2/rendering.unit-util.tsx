import { createDocument } from '../../testing/document';
import { expect } from 'vitest';
import { renderToString } from '../../server/render';
import { getPlatform, setPlatform } from '../platform/platform';
import { notifyChange } from '../render/dom/notify-render';
import type { JSXOutput } from '../render/jsx/types/jsx-node';
import type { Subscriptions } from '../state/common';
import { OnRenderProp } from '../util/markers';
import { DomContainer, getDomContainer } from './client/dom-container';
import { render2 } from './client/render2';
import type { VNode } from './client/types';
import {
  vnode_getAttr,
  vnode_getFirstChild,
  vnode_getParent,
  vnode_getVNodeForChildNode,
  vnode_locate,
  vnode_toString,
} from './client/vnode';
import { codeToName } from './shared-serialization';
import type { fixMeAny } from './shared/types';
import { ssrCreateContainer } from './ssr/ssr-container';
import { ssrRenderToContainer } from './ssr/ssr-render';
import './vdom-diff.unit-util';

export async function domRender(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    /// Use old SSR rendering ond print out debug state. Useful for comparing difference between serialization.
    oldSSR?: boolean;
  } = {}
) {
  const document = createDocument();
  await render2(document.body, jsx);
  const container = getDomContainer(document.body);
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- CSR --------------------------');
    console.log(container.rootVNode.toString());
    console.log('--------------------------------------------------------');
  }
  return {
    document,
    container,
    vNode: vnode_getFirstChild(container.rootVNode),
  };
}

export async function ssrRenderToDom(
  jsx: JSXOutput,
  opts: {
    /// Print debug information to console.
    debug?: boolean;
    /// Use old SSR rendering ond print out debug state. Useful for comparing difference between serialization.
    oldSSR?: boolean;
  } = {}
) {
  if (opts.oldSSR) {
    const platform = getPlatform();
    try {
      const ssr = await renderToString([
        <head>
          <title>{expect.getState().testPath}</title>
        </head>,
        <body>{jsx}</body>,
      ]);
      // restore platform
      console.log('LEGACY HTML', ssr.html);
    } finally {
      setPlatform(platform);
    }
  }
  const ssrContainer = ssrCreateContainer({ tagName: 'html' });
  await ssrRenderToContainer(ssrContainer, [
    <head>
      <title>{expect.getState().testPath}</title>
    </head>,
    <body>{jsx}</body>,
  ]);
  const html = ssrContainer.writer.toString();
  const document = createDocument({ html });
  const container = getDomContainer(document.body.parentElement as HTMLElement) as DomContainer;
  if (opts.debug) {
    console.log('========================================================');
    console.log('------------------------- SSR --------------------------');
    console.log(html);
    console.log('--------------------------------------------------------');
    console.log(vnode_toString.call(container.rootVNode, Number.MAX_SAFE_INTEGER, '', true));
    console.log('------------------- SERIALIZED STATE -------------------');
    console.log('[');
    const state = container.$rawStateData$;
    for (let i = 0; i < state.length; i++) {
      console.log(('    ' + i + ':').substr(-4), qwikJsonStringify(state[i]));
    }
    console.log(']');
    if (false as boolean) {
      console.log('CONTAINER PROXY: [');
      // It's a private prop but not enforced
      const proxyState = (container as any).stateData as DomContainer['stateData'];
      for (let i = 0; i < state.length; i++) {
        console.log(('    ' + i + ':').substr(-4), proxyState[i]);
      }
      console.log(']');
    }
    console.log('--------------------------------------------------------');
  }
  const bodyVNode = vnode_getVNodeForChildNode(container.rootVNode, document.body);
  return { container, document, vNode: vnode_getFirstChild(bodyVNode) };
}

export async function rerenderComponent(element: HTMLElement) {
  const container = getDomContainer(element);
  const vElement = vnode_locate(container.rootVNode, element);
  const host = getHostVNode(vElement)!;
  const subAction: Subscriptions = [0, host as fixMeAny, undefined];
  notifyChange(subAction, container as fixMeAny);
}

function getHostVNode(vElement: VNode | null) {
  while (vElement != null) {
    if (typeof vnode_getAttr(vElement, OnRenderProp) == 'string') {
      return vElement;
    }
    vElement = vnode_getParent(vElement);
  }
  return vElement;
}

function qwikJsonStringify(value: any): string {
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  let json = JSON.stringify(value);
  json = json.replace(/"\\u00([0-9a-f][0-9a-f])/gm, (_, value) => {
    return '"' + RED + codeToName(parseInt(value, 16)) + ': ' + RESET;
  });
  return json;
}
