import {
  ArgPass,
  CaptureAccess,
  FnBodyKind,
  QrlPayloadKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlUse,
} from '../schema';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../segment-identity';
import { QWIK_CORE_IMPORT, QwikWord } from '../words';
import { UnsupportedError } from '../errors';
import type { GenerateOutput } from './output';

/** One function, as neutral data — printed into chunk files, SSR mirrors, and spliced bodies. */
export interface FunctionEmission {
  /** Core imports the function's code needs. */
  imports: Set<string>;
  /** Sibling-chunk imports (nested QRL references). */
  chunkImports: string[];
  /** Module-level companions, e.g. `createTemplate` consts. */
  hoists: string[];
  params: string[];
  statements: string[];
  /** The return expression. */
  value: string;
  async: boolean;
  /** QRLs the function's body references — the placement satisfies them. */
  uses: { qrl: LinkedQrl; invoked: boolean }[];
}

/**
 * One chunk module per QRL. The emitter supplies each QRL's function; this owns only the file
 * scaffolding — paths, imports/hoists placement, and segment metadata.
 */
export function emitQrlChunks(
  module: LinkedModule,
  qrlFunction: (qrl: LinkedQrl) => FunctionEmission
): GenerateOutput['modules'] {
  // Declared QRLs (components) splice over their authored range — no chunk file (yet).
  return module.qrls
    .filter((qrl) => qrl.declaration === undefined)
    .map((qrl) => ({
      path: `${module.path}_${qrl.name}.js`,
      code: chunkModuleCode(qrl, qrlFunction(qrl)),
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
        captures: qrl.captures.length > 0,
        loc: [qrl.origin.range[0], qrl.origin.range[1]],
        paramNames: qrl.origin.paramRanges.map(([start, end]) =>
          module.source.code.slice(start, end)
        ),
        ...(qrl.captures.length > 0 ? { captureNames: captureNames(module, qrl) } : {}),
      },
    }));
}

/** Capture names double as the chunk fn's parameters for value-payload QRLs. */
export function captureNames(module: LinkedModule, qrl: LinkedQrl): string[] {
  return qrl.captures.map((capture) => module.bindings[capture.binding].name);
}

/** Resolves one use site's actuals against the QRL's formal captures. */
export function resolveQrlUse(
  module: LinkedModule,
  use: QrlUse,
  propsName: string
): { qrl: LinkedQrl; args: string[] } {
  const qrl = module.qrls.find((candidate) => candidate.id === use.qrl);
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
        case ArgPass.Props:
          return propsName;
        case ArgPass.StyleScope:
          throw new UnsupportedError('a style-scope QRL argument');
      }
    }),
  };
}

export function qrlPropsName(module: LinkedModule, qrl: LinkedQrl, fallback: string): string {
  const capture = qrl.captures.find(
    (candidate) => candidate.access === CaptureAccess.ComponentProp
  );
  return capture === undefined ? fallback : module.bindings[capture.binding].name;
}

/** Captures restore in one destructuring line: `const [a, b] = _captures;`. */
export function capturePrelude(captures: readonly string[]): string[] {
  return captures.length === 0 ? [] : [`const [${captures.join(', ')}] = ${QwikWord.Captures};`];
}

/** The authored function regenerated from its source slice — target-independent by construction. */
export function sourceFunctionEmission(module: LinkedModule, qrl: LinkedQrl): FunctionEmission {
  if (qrl.origin.bodyKind !== FnBodyKind.Expression) {
    throw new UnsupportedError('emitting a chunk for a block QRL body');
  }
  const source = module.source.code;
  const captures = captureNames(module, qrl);
  const emission = emptyFunctionEmission();
  emission.params =
    qrl.payloadKind === QrlPayloadKind.Value
      ? captures
      : qrl.origin.paramRanges.map(([start, end]) => source.slice(start, end));
  if (qrl.payloadKind === QrlPayloadKind.Function && captures.length > 0) {
    emission.imports.add(QwikWord.Captures);
    emission.statements.push(...capturePrelude(captures));
  }
  emission.value = source.slice(qrl.origin.bodyRange[0], qrl.origin.bodyRange[1]);
  emission.async = qrl.authoredAsync;
  return emission;
}

export function emptyFunctionEmission(): FunctionEmission {
  return {
    imports: new Set(),
    chunkImports: [],
    hoists: [],
    params: [],
    statements: [],
    value: '',
    async: false,
    uses: [],
  };
}

/** The one arrow printer — chunk exports, SSR mirrors, and spliced bodies share these bytes. */
export function functionText(emission: FunctionEmission): string {
  const body = [...emission.statements, `return ${emission.value};`]
    .map((statement) => `  ${statement}`)
    .join('\n');
  return `${emission.async ? 'async ' : ''}(${emission.params.join(', ')}) => {\n${body}\n}`;
}

export function chunkCanonicalFilename(module: LinkedModule, qrl: LinkedQrl): string {
  return `${moduleBasename(module)}_${qrl.name}`;
}

function moduleBasename(module: LinkedModule): string {
  const slash = Math.max(module.path.lastIndexOf('/'), module.path.lastIndexOf('\\'));
  return slash === -1 ? module.path : module.path.slice(slash + 1);
}

function chunkModuleCode(qrl: LinkedQrl, emission: FunctionEmission): string {
  const importLines = [
    ...(emission.imports.size === 0
      ? []
      : [
          `import { ${[...emission.imports].join(', ')} } from ${JSON.stringify(QWIK_CORE_IMPORT)};`,
        ]),
    ...emission.chunkImports,
  ];
  const header = importLines.length === 0 ? '' : `${importLines.join('\n')}\n`;
  const hoists = emission.hoists.length === 0 ? '' : `${emission.hoists.join('\n')}\n`;
  const separator = header === '' && hoists === '' ? '' : '\n';
  return `${header}${hoists}${separator}export const ${qrl.name} = ${functionText(emission)};\n`;
}
