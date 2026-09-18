/** One chunk module per QRL: file paths, import/hoist placement, and segment metadata. */
import {
  ArgPass,
  BoundaryKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlUse,
  type LocalId,
} from '../schema';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../segment-identity';
import { QWIK_CORE_IMPORT, QwikWord } from '../words';
import { UnsupportedError } from '../errors';
import { assembleGeneratedModule } from './source-assembly';
import { createOriginalRangeMapper } from '../source-maps';
import type { SourceMap } from 'oxc-transform';
import { moduleBasename, type GenerateOutput, type PresentationOptions } from './output';
import { emitBindingImports } from './emit-import';
import { functionText } from './print-js';
import { captureNames } from './captures';
import type { FunctionEmission } from './emit-function';
/**
 * One chunk module per QRL. The emitter supplies each QRL's function; this owns only the file
 * scaffolding — paths, imports/hoists placement, and segment metadata.
 */
export function emitQrlChunks(
  module: LinkedModule,
  qrlFunction: (qrl: LinkedQrl) => FunctionEmission,
  options: PresentationOptions,
  moduleExports: ReadonlyMap<LocalId, string>
): GenerateOutput['modules'] {
  const mapRange =
    module.source.normalizationMap === null
      ? (range: [number, number]) => range
      : createOriginalRangeMapper(
          module.source.code,
          module.source.normalizationMap.sourcesContent?.[0] ?? module.source.code,
          module.source.normalizationMap as Parameters<typeof createOriginalRangeMapper>[2]
        );
  // Declared QRLs (components) splice over their authored range — no chunk file (yet); a nested
  // component prints inline where its `component$` call stood.
  return module.qrls
    .filter(
      (qrl) =>
        qrl.declaration === undefined &&
        qrl.boundary.kind !== BoundaryKind.Sync &&
        qrl.boundary.kind !== BoundaryKind.Component
    )
    .map((qrl) => {
      const path = `${module.path}_${qrl.name}.js`;
      const assembled = assembleGeneratedModule(
        module.source.code,
        module.source.originalPath,
        path,
        chunkModuleCode(module, qrl, qrlFunction(qrl), moduleExports),
        qrl.origin.range,
        options.outputSourceMaps === true,
        module.source.normalizationMap as SourceMap | null
      );
      return {
        path,
        code: assembled.code,
        map: assembled.map,
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
          captures: qrl.captures.length > 0,
          loc: mapRange(qrl.origin.range),
          paramNames: qrl.origin.paramRanges.map(([start, end]) =>
            module.source.code.slice(start, end)
          ),
          ...(qrl.captures.length > 0 ? { captureNames: captureNames(module, qrl) } : {}),
        },
      };
    });
}

/** A `sync$` handler ships inline under its symbol: the runtime keys the container table by it. */
export function syncQrlHoists(qrl: LinkedQrl, functionSource: string): string[] {
  return [
    `const ${qrl.name} = ${functionSource};`,
    `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.QrlSync}(${qrl.name}, ${JSON.stringify(qrl.name)});`,
  ];
}

export function chunkCanonicalFilename(module: LinkedModule, qrl: LinkedQrl): string {
  return `${moduleBasename(module)}_${qrl.name}`;
}

function chunkModuleCode(
  module: LinkedModule,
  qrl: LinkedQrl,
  emission: FunctionEmission,
  moduleExports: ReadonlyMap<LocalId, string>
): string {
  const bindingImports = emitBindingImports(
    module,
    qrl.dependencies.bindings,
    emission.imports,
    moduleExports
  );
  const importLines = [
    ...(emission.imports.size === 0
      ? []
      : [
          `import { ${[...emission.imports].join(', ')} } from ${JSON.stringify(QWIK_CORE_IMPORT)};`,
        ]),
    ...emission.chunkImports,
    ...bindingImports,
  ];
  const header = importLines.length === 0 ? '' : `${importLines.join('\n')}\n`;
  const hoists = emission.hoists.length === 0 ? '' : `${emission.hoists.join('\n')}\n`;
  const separator = header === '' && hoists === '' ? '' : '\n';
  return `${header}${hoists}${separator}export const ${qrl.name} = ${functionText(emission)};\n`;
}

export type QrlResolver = ReturnType<typeof createQrlResolver>;

/** Each module generation owns its index; use-site arguments remain uncached. */
export function createQrlResolver(module: LinkedModule) {
  const qrlsById = new Map<string, LinkedQrl>();
  for (const qrl of module.qrls) {
    if (!qrlsById.has(qrl.id)) {
      qrlsById.set(qrl.id, qrl);
    }
  }
  return (use: QrlUse, propsName: string): { qrl: LinkedQrl; args: string[] } => {
    const qrl = qrlsById.get(use.qrl);
    if (qrl === undefined) {
      throw new Error(`pipeline.generate: unknown qrl "${use.qrl}"`);
    }
    if (use.args.length !== qrl.captures.length) {
      throw new Error(`pipeline.generate: qrl "${use.qrl}" capture arity mismatch`);
    }
    return {
      qrl,
      args: use.args.map((arg) => {
        switch (arg.pass) {
          case ArgPass.Binding:
            return module.bindings[arg.binding].name;
          case ArgPass.This:
            return 'this';
          case ArgPass.Arguments:
            return `[...${arg.binding === null ? 'arguments' : module.bindings[arg.binding].name}]`;
          case ArgPass.Props:
            return propsName;
          case ArgPass.StyleScope:
            throw new UnsupportedError('a style-scope QRL argument');
        }
      }),
    };
  };
}
