interface RefSerializationContext {
  $addRoot$(value: unknown): number;
}

export class SsrDomRef {
  declare readonly __brand__: 'DomRef';

  constructor(readonly $nodeId$: number) {}
}

export function setSsrRef(
  value: unknown,
  nodeId: number,
  serializationCtx: RefSerializationContext
): void {
  if (value == null) {
    return;
  }
  const ref = new SsrDomRef(nodeId);
  if (typeof value === 'function') {
    value(ref);
  } else {
    (value as { untrackedValue: SsrDomRef }).untrackedValue = ref;
    serializationCtx.$addRoot$(value);
  }
}
