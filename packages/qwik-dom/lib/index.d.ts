declare module '@qwik.dev/dom' {
  function createDOMImplementation(): DOMImplementation;
  function createDocument(html?: string, force?: boolean): Document;
}
