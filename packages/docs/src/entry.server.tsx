import {
  renderToDocument,
  RenderToStringOptions,
  createDocument,
  RenderToStringResult,
  serializeDocument,
} from '@builder.io/qwik/server';
import { Root } from './root';
import type { SymbolsEntryMap } from 'packages/qwik/dist/optimizer';

export async function render(opts: QwikDocsRenderToStringOptions) {
  const doc = createDocument(opts);

  await renderToDocument(doc, <Root />, opts);

  const symbolMap = (opts.symbols as SymbolsEntryMap)?.mapping;

  if (symbolMap && typeof opts.base === 'string') {
    let qrlBase = opts.base;
    if (!qrlBase.endsWith('/')) {
      qrlBase += '/';
    }

    if (opts.prefetch === 'link') {
      const symbolHrefs = new Set<string>();
      Object.entries(symbolMap).forEach(([_symbolName, qrl]) => {
        // <link rel="prefetch" href="/images/big.jpeg">
        if (!symbolHrefs.has(qrl)) {
          symbolHrefs.add(qrl);
          const href = qrlBase + qrl;
          const link = doc.createElement('link');
          link.setAttribute('rel', 'prefetch');
          link.setAttribute('href', href);
          doc.head.appendChild(link);
        }
      });
    }
  }

  const result: RenderToStringResult = {
    html: serializeDocument(doc, opts),
    timing: {
      createDocument: 0,
      render: 0,
      toString: 0,
    },
  };

  return result;
}

interface QwikDocsRenderToStringOptions extends RenderToStringOptions {
  prefetch?: 'link' | 'worker';
}
