export const parseSerializedQrlRootIds = (value: string) => {
  const [chunkValue, symbolDeltaValue, captureDeltas, extra] = value.split('#');
  const chunkRootId = Number(chunkValue);
  const symbolRootId = chunkRootId + Number(symbolDeltaValue);
  if (
    chunkValue === '' ||
    symbolDeltaValue === '' ||
    extra !== undefined ||
    !Number.isSafeInteger(chunkRootId) ||
    chunkRootId < 0 ||
    !Number.isSafeInteger(symbolRootId) ||
    symbolRootId < 0
  ) {
    throw new Error('Invalid serialized QRL.');
  }
  return [chunkRootId, symbolRootId, captureDeltas || null] as const;
};
