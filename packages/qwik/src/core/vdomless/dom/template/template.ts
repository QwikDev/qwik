export type TemplateFactory = (document: Document) => DocumentFragment;

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
