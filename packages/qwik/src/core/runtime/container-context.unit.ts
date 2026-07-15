import { describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';
import { Constants, TypeIds } from '../shared/serdes/constants';
import { QContainerAttr } from '../shared/utils/markers';
import { createContainerContext, getContextScopeForNode } from './container-context';
import { isContextScope } from './context-scope';

describe('ContainerContext', () => {
  it('adds request data only when provided', () => {
    const withoutData = createContainerContext(createContainer(''));
    const serverData = { value: 'request-value' };
    const withData = createContainerContext(createContainer(''), undefined, serverData);

    expect(Object.prototype.hasOwnProperty.call(withoutData, 'serverData')).toBe(false);
    expect(withData.serverData).toBe(serverData);
  });

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

  it('restores forward refs from a separate state chunk', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Array},[${TypeIds.ForwardRef},0]]
      </script>
      <script type="qwik/state" q:base="1" q:len="1" q:fr>
        [${TypeIds.ForwardRefs},[2]]
      </script>
      <script type="qwik/state" q:base="2" q:len="1">
        [${TypeIds.Plain},"value"]
      </script>
    `);
    const context = createContainerContext(container);

    expect(await context.getRoot(0)).toEqual(['value']);
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
    if (!isContextScope(scope)) {
      throw new Error('Expected a context scope.');
    }
    expect(scope.id).toBe('5');
    expect(scope.values.get('context')).toBe('value');
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

  it('promotes deep root refs across state chunks', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1024);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('restores root refs across state chunks', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},1024]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]
      </script>
    `);
    const context = createContainerContext(container);

    const parent = (await context.getRoot(0)) as { shared: { value: number } };
    const shared = await context.getRoot(1024);

    expect(parent.shared).toBe(shared);
    expect(parent.shared.value).toBe(1);
  });

  it('promotes deep root refs through intermediate root refs', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},62465]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1 1"]
      </script>
      <script type="qwik/state" q:base="62465" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"nested",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]
      </script>
    `);
    const context = createContainerContext(container);

    const nested = await context.getRoot(1024);
    const parent = (await context.getRoot(62465)) as { nested: { value: number } };

    expect(parent.nested).toBe(nested);
    expect(parent.nested.value).toBe(1);
  });

  it('promotes deep root refs through intermediate deep root refs', async () => {
    const container = createContainer(`
      <script type="qwik/state" q:base="0" q:len="1">
        [${TypeIds.Object},[${TypeIds.Plain},"shared",${TypeIds.RootRef},"18 0 1"]]
      </script>
      <script type="qwik/state" q:base="18" q:len="1">
        [${TypeIds.Array},[${TypeIds.Array},[${TypeIds.Plain},"skip",${TypeIds.Object},[${TypeIds.Plain},"value",${TypeIds.Plain},1]]]]
      </script>
      <script type="qwik/state" q:base="1024" q:len="1">
        [${TypeIds.RootRef},"0 1"]
      </script>
    `);
    const context = createContainerContext(container);

    const shared = await context.getRoot(1024);
    const parent = (await context.getRoot(0)) as { shared: { value: number } };

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
