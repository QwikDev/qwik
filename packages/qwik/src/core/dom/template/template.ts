export type TemplateFactory = (document: Document) => DocumentFragment;
export type ElementTemplateFactory = (document: Document) => Element;

const templates = new WeakMap<Document, Map<string, HTMLTemplateElement>>();

function getTemplate(document: Document, html: string): HTMLTemplateElement {
  let documentTemplates = templates.get(document);
  if (documentTemplates === undefined) {
    documentTemplates = new Map();
    templates.set(document, documentTemplates);
  }

  let template = documentTemplates.get(html);
  if (template === undefined) {
    template = document.createElement('template');
    template.innerHTML = html;
    documentTemplates.set(html, template);
  }
  return template;
}

export function createTemplate(html: string): TemplateFactory {
  return (document) => getTemplate(document, html).content.cloneNode(true) as DocumentFragment;
}

/** @internal */
export function createElementTemplate(html: string): ElementTemplateFactory {
  const elements = new WeakMap<Document, Element>();
  return (document) => {
    let element = elements.get(document);
    if (element === undefined) {
      element = getTemplate(document, html).content.firstElementChild!;
      elements.set(document, element);
    }
    return element.cloneNode(true) as Element;
  };
}
