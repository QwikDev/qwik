import { createDocument } from '@builder.io/qwik-dom';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { useStore } from '../use/use-store.public';
import { createWatchFnObserver } from './observer';

describe('observe', () => {
  it('should return a list of changes', () => {
    const doc = createDocument();
    const div = doc.createElement('div');
    useInvoke(newInvokeContext(doc, div, div), () => {
      const storeA = useStore({ foo: 0, bar: 1, other: 2 });
      const storeB = useStore({ name: { first: '', last: '' } });
      const obs = createWatchFnObserver(null!);
      obs(storeA).foo;
      obs(storeB).name.first;
    });
    // expect(map.get(getQObjectId(storeA)!)).toEqual(['foo']);
    // expect(map.get(getQObjectId(storeB)!)).toEqual(['name']);
    // expect(map.get(getQObjectId(storeB.name)!)).toEqual(['first']);
  });
});
