import {
  FnBodyKind,
  FormalAccess,
  QrlBodyKind,
  QrlPayloadKind,
  type LinkedModule,
  type LinkedQrl,
} from '../schema';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../segment-identity';
import { UnsupportedError } from '../errors';
import type { GenerateOutput } from './output';

/** One chunk module per QRL — identical bytes for every JS target. */
export function emitQrlChunks(module: LinkedModule): GenerateOutput['modules'] {
  return module.qrls.map((qrl) => ({
    path: `${module.path}_${qrl.name}.js`,
    code: emitChunkCode(module, qrl),
    map: null,
    isEntry: true,
    origPath: module.path,
    segment: {
      origin: moduleBasename(module),
      name: qrl.name,
      entry: null,
      displayName: getSegmentDisplayName(qrl.name),
      hash: getSegmentSymbolHash(qrl.name),
      canonicalFilename: chunkCanonicalFilename(module, qrl),
      extension: 'js',
      parent: null,
      ctxKind:
        qrl.boundary.kind === 'implicit' && qrl.boundary.role === 'event'
          ? 'eventHandler'
          : 'function',
      ctxName: qrl.ctxName,
      captures: qrl.formals.length > 0,
      loc: [qrl.origin.range[0], qrl.origin.range[1]],
      paramNames: qrl.origin.paramRanges.map(([start, end]) =>
        module.source.code.slice(start, end)
      ),
      ...(qrl.formals.length > 0 ? { captureNames: captureNames(module, qrl) } : {}),
    },
  }));
}

/** Capture names double as the chunk fn's parameters for value-payload QRLs. */
export function captureNames(module: LinkedModule, qrl: LinkedQrl): string[] {
  return qrl.formals.map((formal) => {
    if (formal.access !== FormalAccess.ComponentProp) {
      throw new UnsupportedError('a non-props QRL capture');
    }
    return module.bindings[formal.binding].name;
  });
}

/** The regenerated arrow — shared by the chunk export and the SSR in-module mirror. */
export function chunkFunctionText(module: LinkedModule, qrl: LinkedQrl): string {
  if (qrl.body.b !== QrlBodyKind.Js && qrl.body.b !== QrlBodyKind.Expr) {
    throw new UnsupportedError('emitting a chunk for a program/task QRL body');
  }
  if (qrl.origin.bodyKind !== FnBodyKind.Expression) {
    throw new UnsupportedError('emitting a chunk for a block QRL body');
  }
  const source = module.source.code;
  const params =
    qrl.payloadKind === QrlPayloadKind.Value
      ? captureNames(module, qrl)
      : qrl.origin.paramRanges.map(([start, end]) => source.slice(start, end));
  const [bodyStart, bodyEnd] = qrl.origin.bodyRange;
  const async = qrl.authoredAsync ? 'async ' : '';
  return `${async}(${params.join(', ')}) => {\n  return ${source.slice(bodyStart, bodyEnd)};\n}`;
}

export function chunkCanonicalFilename(module: LinkedModule, qrl: LinkedQrl): string {
  return `${moduleBasename(module)}_${qrl.name}`;
}

function moduleBasename(module: LinkedModule): string {
  const slash = Math.max(module.path.lastIndexOf('/'), module.path.lastIndexOf('\\'));
  return slash === -1 ? module.path : module.path.slice(slash + 1);
}

function emitChunkCode(module: LinkedModule, qrl: LinkedQrl): string {
  return `export const ${qrl.name} = ${chunkFunctionText(module, qrl)};\n`;
}
