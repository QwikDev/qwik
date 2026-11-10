import { defaultScheduler } from '../../runtime/scheduler';
import {
  getStateRoot,
  registerStateData,
  type ContainerContext,
} from '../../runtime/container-context';
import { deserializeCaptures } from './captures';

/** @internal */
export async function _deserialize<T>(raw: string): Promise<T> {
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || (data.length & 1) !== 0) {
    throw new Error('Invalid serialized state.');
  }

  const context = {
    element: null,
    document: null,
    locale: null,
    scheduler: defaultScheduler,
    state: {
      rootToChunk: [],
      forwardRefsChunk: null,
      liveRoots: new Map(),
      disposedRoots: new Set(),
    },
    forwardRefs: null,
    getForwardRefs: () => context.forwardRefs,
    getRoot(id: number | string) {
      return getStateRoot(context as ContainerContext, Number(id));
    },
    restoreCaptures(ids: string) {
      return deserializeCaptures(context as ContainerContext, ids);
    },
  } as unknown as ContainerContext;
  registerStateData(context, data);

  return (await context.getRoot(0)) as T;
}
