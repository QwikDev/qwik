import { createDocument } from '../../testing/document';
import { qProps, QProps } from '../props/q-props.public';
import { qObject } from '../object/q-object.public';
import { useInvoke } from '../use/use-core.public';
import { getQObjectId } from './q-object';
import { qSubscribe } from './q-subscribe.public';

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
    useInvoke(
      () => {
        qSubscribe(qObjB, qObjC);
      },
      div,
      'qRender',
      'url' as any
    );
    expect(div.getAttribute('q:obj')).toEqual(
      [getQObjectId(qObjA), '#2', '!' + getQObjectId(qObjB), '!' + getQObjectId(qObjC)].join(' ')
    );
    useInvoke(
      () => {
        qSubscribe(qObjC);
      },
      div,
      'qRender',
      'url' as any
    );
    expect(div.getAttribute('q:obj')).toEqual(
      [getQObjectId(qObjA), getQObjectId(qObjB), '!' + getQObjectId(qObjC)].join(' ')
    );
    useInvoke(() => {}, div, 'qRender', 'url' as any);
    expect(div.getAttribute('q:obj')).toEqual([getQObjectId(qObjA), getQObjectId(qObjB)].join(' '));
  });
});
