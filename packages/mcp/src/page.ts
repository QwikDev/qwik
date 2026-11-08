import type { InPageBridge } from '../../devtools/kit/src/client-bridge';
import { QWIK_ATTR } from '../../devtools/kit/src/protocol/dom';
import type { InspectInput, LocateInput } from './protocol';
import { readSerializedState, readSerializedVNodeTree } from './serialized';

const outputLimit = 65536;
const inspectorLocation = /^(.*):(\d+):(\d+)$/;
const bounded = (content: string, source: 'live-dom' | 'serialized-dom', offset = 0) => {
  const bytes = new TextEncoder().encode(content);
  if (offset > bytes.length || (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)) {
    throw new Error('Invalid offset for current content. Restart at offset 0.');
  }
  let end = Math.min(offset + outputLimit, bytes.length);
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
    end--;
  }
  return {
    source,
    content: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, end)),
    truncated: end < bytes.length,
    nextOffset: end < bytes.length ? end : null,
  };
};

export async function readPage(
  options: InspectInput,
  doc: Document,
  bridge: Pick<InPageBridge, 'readComponentTree' | 'readVNodeTree'>,
  url: string
) {
  const element = options.selector ? doc.querySelector(options.selector) : doc.documentElement;
  if (!element) {
    throw new Error(`No element matches selector: ${options.selector}`);
  }
  const components = await bridge.readComponentTree();
  const tree = await bridge.readVNodeTree();
  if (!components || !tree) {
    throw new Error('Qwik inspection runtime is unavailable. Wait for the page to finish loading.');
  }
  const stripProps = (nodes: typeof tree): typeof tree =>
    nodes.map(({ props: _props, children, ...node }) => ({
      ...node,
      ...(children ? { children: stripProps(children) } : {}),
    }));
  const html = options.includeHtml ? bounded(element.outerHTML, 'live-dom', options.offset) : null;
  const state = options.includeSerializedState ? readSerializedState(doc) : null;
  const vnodeTree = options.includeSerializedVNodeTree ? await readSerializedVNodeTree(doc) : null;
  return {
    url,
    tree: stripProps(tree),
    components: components.map((component) => ({
      ...component,
      signals: component.signals.map(({ value, ...signal }) =>
        options.includeSignalValues ? { ...signal, value } : signal
      ),
    })),
    ...(html ? { html } : {}),
    ...(options.includeSerializedState
      ? {
          serializedState: state === null ? null : bounded(state, 'serialized-dom', options.offset),
        }
      : {}),
    ...(options.includeSerializedVNodeTree
      ? {
          serializedVNodeTree:
            vnodeTree === null ? null : bounded(vnodeTree, 'serialized-dom', options.offset),
        }
      : {}),
  };
}

/** Reads the `file:line:column` that Qwik dev SSR writes on native elements */
export function locateElement(options: LocateInput, doc: Document, url: string) {
  const elements = doc.querySelectorAll(options.selector);
  if (!elements.length) {
    throw new Error(`No element matches selector: ${options.selector}`);
  }
  const result = { url, selector: options.selector, matches: elements.length };
  // Browser-created elements have no location; fall back to the nearest ancestor, flagged inexact.
  const located = elements[0].closest(`[${QWIK_ATTR.INSPECTOR}]`);
  const match = located?.getAttribute(QWIK_ATTR.INSPECTOR)?.match(inspectorLocation);
  if (!located || !match) {
    return { ...result, source: null };
  }
  const [, file, line, column] = match;
  return {
    ...result,
    source: {
      file,
      line: Number(line),
      column: Number(column),
      tag: located.tagName.toLowerCase(),
      exact: located === elements[0],
    },
  };
}
