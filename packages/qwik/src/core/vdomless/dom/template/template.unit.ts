import { describe, expect, it, vi } from 'vitest';
import { createTemplate } from './template';

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
});

function createFakeDocument() {
  const templates: FakeTemplate[] = [];
  const document = {
    createElement: vi.fn((tagName: string) => {
      if (tagName !== 'template') {
        throw new Error(`Unexpected tag ${tagName}.`);
      }
      const template: FakeTemplate = {
        html: '',
        get innerHTML() {
          return this.html;
        },
        set innerHTML(value: string) {
          this.html = value;
        },
        content: {
          cloneNode: vi.fn(
            () =>
              ({
                ownerDocument: document,
              }) as DocumentFragment
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
  content: {
    cloneNode: ReturnType<typeof vi.fn>;
  };
}
