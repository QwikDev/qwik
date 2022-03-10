import { createDocument } from '../../testing/document';
import { dehydrate } from '@builder.io/qwik';
import { useStore } from '../use/use-store.public';
import { getContext, getProps } from '../props/props';
import type { Props } from '../props/props.public';
import { newInvokeContext, useInvoke } from '../use/use-core';

describe('q-element', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: Props;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    document.body.appendChild(div);
    qDiv = getProps(getContext(div));
  });

  it('should serialize content', () => {
    useInvoke(newInvokeContext(div, div), () => {
      const shared = useStore({ mark: 'CHILD' });
      const state = useStore({ mark: 'WORKS', child: shared, child2: shared });

      dehydrate(document);

      qDiv = getProps(getContext(div));
      expect(state).toEqual({ mark: 'WORKS', child: shared, child2: shared });
    });
  });

  it('should serialize cyclic graphs', () => {
    useInvoke(newInvokeContext(div, div), () => {
      const foo = useStore({ mark: 'foo', bar: {} });
      const bar = useStore({ mark: 'bar', foo: foo });
      foo.bar = bar;
      qDiv.foo = foo;

      dehydrate(document);

      qDiv = getProps(getContext(div));
      const foo2 = qDiv.foo;
      const bar2 = foo2.bar;
      expect(foo2.mark).toEqual('foo');
      expect(bar2.mark).toEqual('bar');
      expect(foo2.bar.foo == foo2).toBe(true);
    });
  });
});
