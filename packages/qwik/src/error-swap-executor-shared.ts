const Q_ERROR_CONTENT_SELECTOR = '[q\\:ebc="';
const Q_ERROR_FALLBACK_SELECTOR = '[q\\:ebf="';
const Q_CONTAINER_SELECTOR = '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])';

type ErrorSwapExecutor = {
  (boundaryId: number): void;
  d: Document;
};

type ErrorSwapGlobal = typeof globalThis & {
  qErr?: ErrorSwapExecutor;
};

/**
 * Qwikloader broadcasts document/window events to every matching element in the document, and
 * `display:none` still counts as connected, so a torn-down subtree keeps handling them.
 */
const stripBroadcastHandlers = (content: Element) => {
  const nodes = content.querySelectorAll('*');
  for (let i = 0; i < nodes.length; i++) {
    const attrs = nodes[i].attributes;
    for (let j = attrs.length - 1; j >= 0; j--) {
      const name = attrs[j].name;
      if (name.indexOf('q-d:') === 0 || name.indexOf('q-w:') === 0) {
        nodes[i].removeAttribute(name);
      }
    }
  }
};

export const installErrorSwapExecutor = (doc: Document) => {
  const qErr = ((boundaryId: number) => {
    const scope = doc.currentScript?.closest(Q_CONTAINER_SELECTOR) || doc;
    const content = scope.querySelector(Q_ERROR_CONTENT_SELECTOR + boundaryId + '"]');
    const fallback = scope.querySelector(Q_ERROR_FALLBACK_SELECTOR + boundaryId + '"]');
    if (content && (content as HTMLElement).style) {
      (content as HTMLElement).style.display = 'none';
      stripBroadcastHandlers(content);
    }
    if (fallback && (fallback as HTMLElement).style) {
      (fallback as HTMLElement).style.display = 'contents';
    }
  }) as ErrorSwapExecutor;
  qErr.d = doc;
  (globalThis as ErrorSwapGlobal).qErr = qErr;
};
