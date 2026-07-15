import { allocate } from './allocate';
import { TypeIds } from './constants';
import { needsInflation } from './deser-proxy';
import { inflate } from './inflate';
import { createSerializationContext } from './serialization-context';
import { defaultScheduler } from '../../runtime/scheduler';
import type { ContainerContext } from '../../runtime/container-context';

/** @internal */
export async function _serialize<T>(data: T): Promise<string> {
  const context = createSerializationContext(
    null,
    () => '',
    () => {},
    new WeakMap<object, object>()
  );
  context.$addRoot$(data);
  await context.$serialize$();
  return context.$writer$.toString();
}

/** @internal */
export async function _deserialize<T>(raw: string): Promise<T> {
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || (data.length & 1) !== 0) {
    throw new Error('Invalid serialized state.');
  }

  const roots = new Map<number, unknown>();
  const context = {
    element: null,
    document: null,
    locale: null,
    scheduler: defaultScheduler,
    state: { rootToChunk: [], forwardRefsChunk: null, liveRoots: roots },
    forwardRefs: null,
    getForwardRefs: () => context.forwardRefs,
    async getRoot(id: number | string) {
      const index = Number(id);
      if (roots.has(index)) {
        return roots.get(index);
      }
      const offset = index * 2;
      if (offset < 0 || offset + 1 >= data.length) {
        throw new Error(`Missing serialized root ${index}.`);
      }
      const type = data[offset] as TypeIds;
      const value = data[offset + 1];
      const root = await allocate(context as ContainerContext, type, value);
      roots.set(index, root);
      if (needsInflation(type)) {
        await inflate(context as ContainerContext, root, type, value);
      }
      return root;
    },
    async restoreCaptures(ids: string) {
      const parts = ids.trim() ? ids.trim().split(' ') : [];
      return Promise.all(parts.map((id) => context.getRoot(id)));
    },
    notify: (subscriber: any) => defaultScheduler.notify(subscriber),
  } as unknown as ContainerContext;

  return (await context.getRoot(0)) as T;
}
