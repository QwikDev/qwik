import { parseSerializedQrlRootIds } from '../qrl/qrl-capture-deltas';
import type { ContainerContext } from '../../runtime/container-context';
import { unwrapPromiseRoot } from './promise-root';

export const deserializeCaptures = (
  container: ContainerContext,
  captures: string
): Promise<unknown[]> => {
  let previousRootId = 0;
  let captureDeltas = captures;
  if (captures.includes('#')) {
    const [, symbolRootId, serializedDeltas] = parseSerializedQrlRootIds(captures);
    previousRootId = symbolRootId;
    captureDeltas = serializedDeltas ?? '';
  }

  const rootIds = captureDeltas
    .split(' ')
    .filter(Boolean)
    .map((delta) => {
      previousRootId += Number(delta);
      if (!Number.isSafeInteger(previousRootId) || previousRootId < 0) {
        throw new Error('Invalid serialized QRL captures.');
      }
      return previousRootId;
    });
  return Promise.all(rootIds.map((id) => container.getRoot(id))).then((roots) =>
    roots.map(unwrapPromiseRoot)
  );
};
