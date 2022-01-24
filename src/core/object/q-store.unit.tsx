import { createDocument } from '../../testing/document';
import { qProps, QProps } from '../props/q-props.public';
import { qDehydrate } from '@builder.io/qwik';
import { useState } from '../use/use-state.public';

describe('q-element', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: QProps;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    document.body.appendChild(div);
    qDiv = qProps(div);
  });

  it('should serialize content', () => {
    const shared = useState({ mark: 'CHILD' });
    const state = useState({ mark: 'WORKS', child: shared, child2: shared });

    qDehydrate(document);

    qDiv = qProps(div);
    expect(state).toEqual({ mark: 'WORKS', child: shared, child2: shared });
  });

  it('should serialize cyclic graphs', () => {
    const foo = useState({ mark: 'foo', bar: {} });
    const bar = useState({ mark: 'bar', foo: foo });
    foo.bar = bar;
    qDiv.foo = foo;

    qDehydrate(document);

    qDiv = qProps(div);
    const foo2 = qDiv.foo;
    const bar2 = foo2.bar;
    expect(foo2.mark).toEqual('foo');
    expect(bar2.mark).toEqual('bar');
    expect(foo2.bar.foo == foo2).toBe(true);
  });
});
