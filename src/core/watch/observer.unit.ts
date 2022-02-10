import { getQObjectId } from '../object/q-object';
import { createStore } from '../use/use-store.public';
import { createWatchFnObserver } from './observer';

describe('observe', () => {
  it('should return a list of changes', () => {
    const storeA = createStore({ foo: 0, bar: 1, other: 2 });
    const storeB = createStore({ name: { first: '', last: '' } });
    const obs = createWatchFnObserver(null!);
    obs(storeA).foo;
    obs(storeB).name.first;
    const map = obs.getGuard();
    expect(map.get(getQObjectId(storeA)!)).toEqual(['foo']);
    expect(map.get(getQObjectId(storeB)!)).toEqual(['name']);
    expect(map.get(getQObjectId(storeB.name)!)).toEqual(['first']);
  });
});
