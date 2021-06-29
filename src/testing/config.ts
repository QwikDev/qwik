export function applyDocumentConfig(
  doc: Document,
  config: { baseURI?: string; protocol?: Record<string, string> }
) {
  if (config.baseURI) {
    appendConfig(doc, `baseURI`, config.baseURI);
  }
  if (config.protocol) {
    for (const protocol in config.protocol) {
      appendConfig(doc, `protocol.${protocol}`, config.protocol[protocol]);
    }
  }
}

function appendConfig(doc: Document, key: string, value: string) {
  const linkElm = doc.createElement('link');
  linkElm.setAttribute(`rel`, `q.${key}`);
  linkElm.setAttribute(`href`, value);
  doc.head.appendChild(linkElm);
}
