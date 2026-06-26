// Installed independently of the OOOS Suspense executor (`qO`) so an in-order SSR error still swaps without Suspense.

const Q_ERROR_CONTENT_SELECTOR = '[q\\:ebc="';
const Q_ERROR_FALLBACK_SELECTOR = '[q\\:ebf="';
const Q_CONTAINER_SELECTOR = '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])';

type ErrorSwapScope = Document | Element;

type ErrorSwapExecutor = {
  (boundaryId: number): void;
  d: Document;
};

type ErrorSwapGlobal = typeof globalThis & {
  qErr?: ErrorSwapExecutor;
};

export const installErrorSwapExecutor = (doc: Document) => {
  const getScope = (): ErrorSwapScope => {
    const script = doc.currentScript;
    return script ? script.closest(Q_CONTAINER_SELECTOR) || doc : doc;
  };

  const qErr = ((boundaryId: number) => {
    const scope = getScope();
    const content = scope.querySelector(Q_ERROR_CONTENT_SELECTOR + boundaryId + '"]');
    const fallback = scope.querySelector(Q_ERROR_FALLBACK_SELECTOR + boundaryId + '"]');
    if (content && (content as HTMLElement).style) {
      (content as HTMLElement).style.display = 'none';
    }
    if (fallback && (fallback as HTMLElement).style) {
      (fallback as HTMLElement).style.display = 'contents';
    }
  }) as ErrorSwapExecutor;
  qErr.d = doc;
  (globalThis as ErrorSwapGlobal).qErr = qErr;
};
