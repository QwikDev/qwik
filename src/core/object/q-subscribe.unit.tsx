import { createDocument } from '../../testing/document';
import { qProps, QProps } from '../props/q-props.public';
import { qObject } from '../object/q-object';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { getQObjectId } from './q-object';
import { qSubscribe } from './q-subscribe';

describe('q-subscribe', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: QProps;
  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    qDiv = qProps(div);
  });

  it('should mark component dirty on change', async () => {
    const qObjA = qObject({ mark: 'A' });
    const qObjB = qObject({ mark: 'B' });
    const qObjC = qObject({ mark: 'C' });
    qDiv.a = qObjA;
    qDiv.b = qObjB;
    useInvoke(newInvokeContext(div, 'qRender', 'url' as any), () => {
      qSubscribe(qObjB, qObjC);
    });
    expect(div.getAttribute('q:obj')).toEqual(
      [getQObjectId(qObjA), '#2', '!' + getQObjectId(qObjB), '!' + getQObjectId(qObjC)].join(' ')
    );
    useInvoke(newInvokeContext(div, 'qRender', 'url' as any), () => {
      qSubscribe(qObjC);
    });
    expect(div.getAttribute('q:obj')).toEqual(
      [getQObjectId(qObjA), getQObjectId(qObjB), '!' + getQObjectId(qObjC)].join(' ')
    );
    useInvoke(newInvokeContext(div, 'qRender', 'url' as any), () => {});
    expect(div.getAttribute('q:obj')).toEqual([getQObjectId(qObjA), getQObjectId(qObjB)].join(' '));
  });
});
