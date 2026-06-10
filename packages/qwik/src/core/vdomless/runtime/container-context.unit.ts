import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { TypeIds } from '../../shared/serdes/constants';
import { QContainerAttr } from '../../shared/utils/markers';
import { createContainerContext } from './container-context';

describe('ContainerContext', () => {
  it('requires chunk metadata for state scripts', () => {
    const container = createContainer('<script type="qwik/state">[]</script>');

    expect(() => createContainerContext(container)).toThrow(
      'Qwik state scripts require q:base and q:len.'
    );
  });

  it('registers state chunk ranges without eagerly parsing script bodies', () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">not json</script>
      <script type="qwik/state" q:base="1" q:len="2">
        [${TypeIds.Plain},"one",${TypeIds.Plain},"two"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(context.getRoot(2)).toBe('two');
    expect(context.restoreCaptures('1 2')).toEqual(['one', 'two']);
  });
});

function createContainer(html: string): Element {
  const document = createDocument({
    html: `<div ${QContainerAttr}="paused">${html}</div>`,
  });
  const container = document.body.firstElementChild;
  if (container === null) {
    throw new Error('Missing test container.');
  }
  return container;
}
