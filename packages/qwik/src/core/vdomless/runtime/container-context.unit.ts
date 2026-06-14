import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { Constants, TypeIds } from '../../shared/serdes/constants';
import { QContainerAttr } from '../../shared/utils/markers';
import { createContainerContext, getContextScopeForNode } from './container-context';
import { isContextScope } from './context-scope';

describe('ContainerContext', () => {
  it('requires chunk metadata for state scripts', () => {
    const container = createContainer('<script type="qwik/state">[]</script>');

    expect(() => createContainerContext(container)).toThrow(
      'Qwik state scripts require q:base and q:len.'
    );
  });

  it('registers state chunk ranges without eagerly parsing script bodies', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">not json</script>
      <script type="qwik/state" q:base="1" q:len="2">
        [${TypeIds.Plain},"one",${TypeIds.Plain},"two"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(await context.getRoot(2)).toBe('two');
    expect(await context.restoreCaptures('1 2')).toEqual(['one', 'two']);
  });

  it('restores context scopes from context markers by state root id', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="5" q:len="1">
        [${TypeIds.ContextScope},[${TypeIds.Constant},${Constants.Null},${TypeIds.Plain},"context",${TypeIds.Plain},"value"]]
      </script>
      <!c=5><button q-e:click="">Click</button><!/c>
    `);
    const context = createContainerContext(container);
    const button = container.querySelector('button')!;

    const scope = await getContextScopeForNode(context, button);

    expect(isContextScope(scope)).toBe(true);
    expect(scope?.id).toBe('5');
    expect(scope?.values.get('context')).toBe('value');
  });

  it('resolves deep root refs lazily after the parent root is restored', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="5" q:len="2">
        [${TypeIds.ContextScope},[${TypeIds.Constant},${Constants.Null},${TypeIds.Plain},"context",${TypeIds.Plain},"value"],${TypeIds.RootRef},"5 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const scope = await context.getRoot(5);

    expect(isContextScope(scope)).toBe(true);
    expect(await context.getRoot(6)).toBe('context');
  });

  it('keeps lazily promoted deep root refs shared with parent roots', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]],${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const parent = (await context.getRoot(0)) as { shared: { value: number } };
    const shared = await context.getRoot(1);

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('keeps lazy deep root refs idempotent when the promoted root is restored first', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="2">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]],${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
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
