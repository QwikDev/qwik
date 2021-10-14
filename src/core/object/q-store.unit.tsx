import { createDocument } from '../../testing/document';
import { qProps, QProps } from '../props/q-props.public';
import { qObject, qDehydrate } from '@builder.io/qwik';
import { _qObject } from './q-object';

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
    const shared = qObject({ mark: 'CHILD' });
    qDiv['state:'] = _qObject({ mark: 'WORKS', child: shared, child2: shared }, '');

    qDehydrate(document);

    qDiv = qProps(div);
    expect(qDiv['state:']).toEqual({ mark: 'WORKS', child: shared, child2: shared });
  });

  it('should serialize same objects multiple times', () => {
    const foo = _qObject({ mark: 'CHILD' }, 'foo');
    qDiv['state:foo'] = foo;
    qDiv.foo = foo;

    qDehydrate(document);

    qDiv = qProps(div);
    expect(qDiv['state:foo']).toEqual(foo);
    expect(qDiv.foo).toEqual(foo);
  });
  it('should serialize cyclic graphs', () => {
    const foo = _qObject({ mark: 'foo', bar: {} }, 'foo');
    const bar = _qObject({ mark: 'bar', foo: foo }, 'bar');
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
