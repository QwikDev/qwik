import { describe, expect, it, vi } from 'vitest';
import { createElementTemplate, createTemplate } from './template';

describe('createTemplate', () => {
  it('caches templates per document and returns fresh clones', () => {
    const first = createFakeDocument();
    const second = createFakeDocument();
    const clone = createTemplate('<p> </p>');

    const firstClone = clone(first.document);
    const secondClone = clone(first.document);
    const otherDocumentClone = clone(second.document);

    expect(first.createElement).toHaveBeenCalledOnce();
    expect(second.createElement).toHaveBeenCalledOnce();
    expect(first.templates[0].html).toBe('<p> </p>');
    expect(first.templates[0].content.cloneNode).toHaveBeenCalledTimes(2);
    expect(first.templates[0].content.cloneNode).toHaveBeenCalledWith(true);
    expect(firstClone).not.toBe(secondClone);
    expect(otherDocumentClone.ownerDocument).toBe(second.document);
  });

  it('passes placeholder HTML into the template', () => {
    const fake = createFakeDocument();

    createTemplate('<span> </span>')(fake.document);

    expect(fake.templates[0].html).toBe('<span> </span>');
  });

  it('returns fresh element clones without cloning the fragment', () => {
    const first = createFakeDocument();
    const second = createFakeDocument();
    const clone = createElementTemplate('<p> </p>');

    const firstClone = clone(first.document);
    const secondClone = clone(first.document);
    const otherDocumentClone = clone(second.document);

    expect(first.createElement).toHaveBeenCalledOnce();
    expect(second.createElement).toHaveBeenCalledOnce();
    expect(first.templates[0].content.cloneNode).not.toHaveBeenCalled();
    expect(first.templates[0].element.cloneNode).toHaveBeenCalledTimes(2);
    expect(first.templates[0].element.cloneNode).toHaveBeenCalledWith(true);
    expect(firstClone).not.toBe(secondClone);
    expect(otherDocumentClone.ownerDocument).toBe(second.document);
  });

  it('isolates mutations between element clones', () => {
    const { document } = createFakeDocument();
    const clone = createElementTemplate('<p>value</p>');

    const first = clone(document);
    first.setAttribute('data-state', 'changed');
    const second = clone(document);

    expect(first).not.toBe(second);
    expect(second.getAttribute('data-state')).toBeNull();
  });
});

function createFakeDocument() {
  const templates: FakeTemplate[] = [];
  const document = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'template') {
        throw new Error(`Unexpected tag ${tagName}.`);
      }
      const createClone = () => {
        const attributes = new Map<string, string>();
        return {
          ownerDocument: document,
          setAttribute(name: string, value: string) {
            attributes.set(name, value);
          },
          getAttribute(name: string) {
            return attributes.get(name) ?? null;
          },
        } as unknown as Element;
      };
      const element = {
        ownerDocument: document,
        cloneNode: vi.fn(createClone),
      };
      const template: FakeTemplate = {
        html: '',
        element,
        get innerHTML() {
          return this.html;
        },
        set innerHTML(value: string) {
          this.html = value;
        },
        content: {
          firstElementChild: element as unknown as Element,
          cloneNode: vi.fn(
            () =>
              ({
                ownerDocument: document,
              }) as unknown as DocumentFragment
          ),
        },
      };
      templates.push(template);
      return template as unknown as HTMLTemplateElement;
    }),
  };
  return {
    document: document as unknown as Document,
    createElement: document.createElement,
    templates,
  };
}

interface FakeTemplate {
  html: string;
  innerHTML: string;
  element: {
    ownerDocument: unknown;
    cloneNode: ReturnType<typeof vi.fn>;
  };
  content: {
    firstElementChild: Element;
    cloneNode: ReturnType<typeof vi.fn>;
  };
}
