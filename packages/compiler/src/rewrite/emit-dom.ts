import type { Op } from './types';

export function getDomEffectBatchKeys(ops: readonly Op[], source: string) {
  const seen = new Set<string>();
  const batches = new Set<string>();
  for (const op of ops) {
    const key = getDomEffectBatchKey(op, source);
    if (key === null) {
      continue;
    }
    if (seen.has(key)) {
      batches.add(key);
    }
    seen.add(key);
  }
  return batches;
}

export function getDomEffectBatchKey(op: Op, source: string): string | null {
  switch (op.kind) {
    case 'event':
      return null;
    case 'propsEffect':
      return getCaptureBatchKey(op.binding.captures);
    case 'attrEffect':
    case 'textEffect':
      switch (op.binding.kind) {
        case 'source':
          return `source:${source.slice(op.binding.range[0], op.binding.range[1])}`;
        case 'expression':
          return getCaptureBatchKey(op.binding.captures);
        case 'unsupported':
          return null;
      }
  }
}

function getCaptureBatchKey(captures: readonly string[]) {
  return `captures:${[...captures].sort().join(',')}`;
}
