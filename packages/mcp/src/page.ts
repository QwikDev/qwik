import type { InPageBridge } from '../../devtools/kit/src/client-bridge';
import type { InspectInput } from './protocol';

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
  let html;
  if (options.includeHtml) {
    const bytes = new TextEncoder().encode(element.outerHTML);
    html = {
      source: 'live-dom' as const,
      content: new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 65536), {
        stream: true,
      }),
      truncated: bytes.length > 65536,
    };
  }
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
  };
}
