import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, it } from 'vitest';

describe('serializer v2', () => {
  describe('basic use cases', () => {
    it('should do basic serialize/deserialize', () => {
      const input = <div>test</div>;
      const output = toVDOM(toDOM(toHTML(<div>test</div>)));
      expect(output).toMatchVDOM(input);
    });
  });
});

function toHTML(jsx: JSXNode): string {
  return null!;
}

function toDOM(html: string): HTMLElement {
  return null!;
}

function toVDOM(container: HTMLElement): VNode {
  return null!;
}
