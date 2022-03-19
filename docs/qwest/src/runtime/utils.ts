export const normalizeUrl = (url: URL | string) =>
  typeof url === 'string' || url == null ? new URL(url || '/', 'https://document.qwik.dev') : url;

export const getDocument = (elm: any): Document => {
  if (elm.nodeType === 9) {
    return elm;
  }
  return elm.ownerDocument;
};

export const getWindow = (elm: any) => {
  return getDocument(elm).defaultView!;
};
