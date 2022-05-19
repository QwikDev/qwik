declare module '@builder.io/qwik-dom' {
  function createDOMImplementation(): DOMImplementation;
  function createDocument(html?: string, force?: boolean): Document;
}
