/** One chunk module per QRL: file paths, import/hoist placement, and segment metadata. */
import {
  ArgPass,
  BoundaryKind,
  DeliveryKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlUse,
  type LocalId,
} from '../schema';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../segment-identity';
import { resolveSegmentEntry } from './entry-strategy';
import { QWIK_CORE_IMPORT, QwikWord } from '../words';
import { UnsupportedError } from '../errors';
import { assembleGeneratedModule } from './source-assembly';
import { createOriginalRangeMapper } from '../source-maps';
import type { SourceMap } from 'oxc-transform';
import { minifySync } from 'oxc-minify';
import { moduleBasename, type GenerateOutput, type PresentationOptions } from './output';
import { emitBindingImports } from './emit-import';
import { functionText } from './print-js';
import { captureNames, eventParamNames } from './captures';
import type { FunctionEmission } from './emit-function';
/**
 * One chunk module per QRL. The emitter supplies each QRL's function; this owns only the file
 * scaffolding — paths, imports/hoists placement, and segment metadata.
 */
export function emitQrlChunks(
  module: LinkedModule,
  qrlFunction: (qrl: LinkedQrl) => FunctionEmission,
  options: PresentationOptions,
  moduleExports: ReadonlyMap<LocalId, string>,
  segments: ReadonlyMap<LocalId, LinkedQrl>
): GenerateOutput['modules'] {
  // A declaration without a symbol splices over its authored range; a nested component prints
  // inline where its `component$` call stood.
  return module.qrls
    .filter(
      (qrl) =>
        (qrl.declaration === undefined || isComponentSegment(qrl)) &&
        qrl.boundary.kind !== BoundaryKind.Sync &&
        !isInlineComponent(qrl) &&
        qrl.delivery.d !== DeliveryKind.Stripped &&
        qrl.delivery.d !== DeliveryKind.Omit
    )
    .map((qrl) => {
      const path = `${module.path}_${chunkSymbolName(qrl)}.js`;
      const assembled = assembleGeneratedModule(
        module.source.code,
        module.source.originalPath,
        path,
        chunkModuleCode(module, qrl, qrlFunction(qrl), moduleExports, segments, options),
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
        segment: getSegmentAnalysis(module, qrl, options),
      };
    });
}

/** Segment identity survives stripping its executable body. */
export function getSegmentAnalysis(
  module: LinkedModule,
  qrl: LinkedQrl,
  options: PresentationOptions = {}
): NonNullable<GenerateOutput['modules'][number]['segment']> {
  const mapRange =
    module.source.normalizationMap === null
      ? (range: [number, number]) => range
      : createOriginalRangeMapper(
          module.source.code,
          module.source.normalizationMap.sourcesContent?.[0] ?? module.source.code,
          module.source.normalizationMap as Parameters<typeof createOriginalRangeMapper>[2]
        );
  const name = chunkSymbolName(qrl);
  const origin = segmentOrigin(module, options.srcDir);
  const canonicalFilename = chunkCanonicalFilename(module, qrl);
  const ctxKind =
    qrl.boundary.kind === 'implicit' && qrl.boundary.role === 'event' ? 'eventHandler' : 'function';
  const captures = qrl.captures.length > 0;
  return {
    origin,
    name,
    entry: resolveSegmentEntry(options.entryStrategy, {
      name,
      canonicalFilename,
      origin,
      ctxKind,
      ctxName: qrl.ctxName,
      captures,
      rootContext: qrl.rootContext ?? null,
      isEventOnly: qrl.eventOnly === true,
    }),
    displayName: getSegmentDisplayName(name),
    hash: getSegmentSymbolHash(name),
    canonicalFilename,
    extension: 'js',
    parent: null,
    ctxKind,
    ctxName: qrl.ctxName,
    captures,
    loc: mapRange(qrl.origin.range),
    paramNames: eventParamNames(
      module,
      qrl,
      qrl.origin.paramRanges.map(([start, end]) => module.source.code.slice(start, end))
    ),
    ...(qrl.captures.length > 0 ? { captureNames: captureNames(module, qrl) } : {}),
  };
}

/**
 * A `sync$` handler ships inline under its symbol: the runtime keys the container table by it. The
 * server writes its source into the HTML, so SSR passes that source already minified.
 */
export function syncQrlHoists(qrl: LinkedQrl, functionSource: string, isServer = false): string[] {
  const serialized = isServer ? `, ${JSON.stringify(minifyFunction(functionSource))}` : '';
  return [
    `const ${qrl.name} = ${functionSource};`,
    `const q_${qrl.name} = /*#__PURE__*/ ${QwikWord.QrlSync}(${qrl.name}, ${JSON.stringify(qrl.name)}${serialized});`,
  ];
}

function minifyFunction(source: string): string {
  // a default export keeps the function alive through compression
  const { code, errors } = minifySync('sync.js', `export default ${source};`, { module: true });
  if (errors.length > 0) {
    throw new UnsupportedError(`a sync$ function that does not minify: ${errors[0].message}`);
  }
  return code.replace(/^export default /, '').replace(/;\s*$/, '');
}

/** The module path relative to `srcDir`, the way the v2 optimizers report a segment's origin. */
function segmentOrigin(module: LinkedModule, srcDir: string | undefined): string {
  const path = module.path.replace(/\\/g, '/');
  const prefix = srcDir === undefined ? null : `${srcDir.replace(/\\/g, '/').replace(/\/$/, '')}/`;
  return prefix !== null && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export function chunkCanonicalFilename(module: LinkedModule, qrl: LinkedQrl): string {
  return `${moduleBasename(module)}_${chunkSymbolName(qrl)}`;
}

/** A declared component exports its hashed symbol; every other chunk exports the QRL name. */
export function chunkSymbolName(qrl: LinkedQrl): string {
  return qrl.declaration?.symbol ?? qrl.name;
}

/** Component segments by the binding their declaration names. */
export function componentSegmentsByBinding(module: LinkedModule): Map<LocalId, LinkedQrl> {
  const segments = new Map<LocalId, LinkedQrl>();
  for (const qrl of module.qrls) {
    const binding = qrl.declaration?.binding;
    if (binding != null && isComponentSegment(qrl)) {
      segments.set(binding, qrl);
    }
  }
  return segments;
}

/** `import { Symbol as name }` of a component segment. */
export function componentSegmentImport(
  module: LinkedModule,
  qrl: LinkedQrl,
  localName: string,
  options: PresentationOptions
): string {
  const symbol = chunkSymbolName(qrl);
  const specifier = localName === symbol ? symbol : `${symbol} as ${localName}`;
  return `import { ${specifier} } from ${JSON.stringify(chunkImportSpecifier(module, qrl, options))};`;
}

/** A component declaration with a symbol lives in its own segment, like every `$` body. */
export function isComponentSegment(qrl: LinkedQrl): boolean {
  const declaration = qrl.declaration;
  return (
    declaration?.symbol !== undefined &&
    declaration.expressionOnly !== true &&
    qrl.aliasOf === undefined
  );
}

/** Dev servers resolve segments by their emitted `.js` path, so they ask for the extension. */
export function chunkImportSpecifier(
  module: LinkedModule,
  qrl: LinkedQrl,
  options: PresentationOptions
): string {
  const specifier = `./${chunkCanonicalFilename(module, qrl)}`;
  return options.explicitExtensions ? `${specifier}.js` : specifier;
}

function chunkModuleCode(
  module: LinkedModule,
  qrl: LinkedQrl,
  emission: FunctionEmission,
  moduleExports: ReadonlyMap<LocalId, string>,
  segments: ReadonlyMap<LocalId, LinkedQrl>,
  options: PresentationOptions
): string {
  const bindings = [
    ...new Set([...qrl.dependencies.bindings, ...(emission.mirroredBindings ?? [])]),
  ];
  const bindingImports = emitBindingImports(module, bindings, emission.imports, moduleExports);
  // A sibling component comes from its own segment, so the chunk skips the parent module.
  const selfAliases: string[] = [];
  for (const binding of bindings) {
    const component = segments.get(binding);
    const name = module.bindings[binding].name;
    if (component === qrl) {
      // A recursive component names itself; the declaration below is that binding.
      if (name !== chunkSymbolName(qrl)) {
        selfAliases.push(`const ${name} = ${chunkSymbolName(qrl)};`);
      }
    } else if (component !== undefined) {
      bindingImports.push(componentSegmentImport(module, component, name, options));
    }
  }
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
  const allHoists = [...selfAliases, ...emission.hoists];
  const hoists = allHoists.length === 0 ? '' : `${allHoists.join('\n')}\n`;
  const separator = header === '' && hoists === '' ? '' : '\n';
  const name = chunkSymbolName(qrl);
  // A function declaration is initialized before a module cycle evaluates the parent.
  const declaration = isComponentSegment(qrl)
    ? `export ${functionText({ ...emission, functionName: name })}`
    : `export const ${name} = ${functionText(emission)};`;
  return `${header}${hoists}${separator}${declaration}\n`;
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

/** A nested `component$` value: printed where its call stood, so it is nobody's chunk. */
export function isInlineComponent(qrl: LinkedQrl): boolean {
  return qrl.boundary.kind === BoundaryKind.Component && qrl.boundary.inline === true;
}
