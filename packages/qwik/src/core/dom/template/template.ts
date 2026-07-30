export type TemplateFactory = (document: Document) => DocumentFragment;
export type ElementTemplateFactory = (document: Document) => Element;

export function createTemplate(html: string): TemplateFactory {
  const templates = new WeakMap<Document, HTMLTemplateElement>();

  return (document) => {
    let template = templates.get(document);
    if (template === undefined) {
      template = document.createElement('template');
      template.innerHTML = html;
      templates.set(document, template);
    }
    return template.content.cloneNode(true) as DocumentFragment;
  };
}

/** @internal */
export function createElementTemplate(html: string): ElementTemplateFactory {
  const templates = new WeakMap<Document, Element>();

  return (document) => {
    let element = templates.get(document);
    if (element === undefined) {
      const template = document.createElement('template');
      template.innerHTML = html;
      element = template.content.firstElementChild!;
      templates.set(document, element);
    }
    return element.cloneNode(true) as Element;
  };
}
