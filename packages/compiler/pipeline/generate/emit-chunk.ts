import {
  ArgPass,
  BoundaryKind,
  CaptureAccess,
  ExprKind,
  QrlBodyKind,
  ReadRole,
  ResumeKind,
  Shape,
  ValueKind,
  type LinkedModule,
  type LinkedQrl,
  type QrlUse,
  type Value,
  type Expr,
  type Range,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { getSegmentDisplayName, getSegmentSymbolHash } from '../segment-identity';
import { QWIK_CORE_IMPORT, QwikWord, SegmentContext } from '../words';
import { UnsupportedError } from '../errors';
import { assembleGeneratedModule } from '../../src/module-assembly';
import { createOriginalRangeMapper } from '../../src/normalization';
import type { SourceMap } from 'oxc-transform';
import type { GenerateOutput, PresentationOptions } from './output';

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
  /** Return expression, or empty for a statement-only body. */
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
  qrlFunction: (qrl: LinkedQrl) => FunctionEmission,
  options: PresentationOptions
): GenerateOutput['modules'] {
  const mapRange =
    module.source.normalizationMap === null
      ? (range: [number, number]) => range
      : createOriginalRangeMapper(
          module.source.code,
          module.source.normalizationMap.sourcesContent?.[0] ?? module.source.code,
          module.source.normalizationMap as Parameters<typeof createOriginalRangeMapper>[2]
        );
  // Declared QRLs (components) splice over their authored range — no chunk file (yet).
  return module.qrls
    .filter((qrl) => qrl.declaration === undefined)
    .map((qrl) => {
      const path = `${module.path}_${qrl.name}.js`;
      const assembled = assembleGeneratedModule(
        module.source.code,
        module.source.originalPath,
        path,
        chunkModuleCode(qrl, qrlFunction(qrl)),
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

/** Capture names double as the chunk fn's parameters for value-payload QRLs. */
export function captureNames(module: LinkedModule, qrl: LinkedQrl): string[] {
  return qrl.captures.map((capture) => module.bindings[capture.binding].name);
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
          case ArgPass.Props:
            return propsName;
          case ArgPass.StyleScope:
            throw new UnsupportedError('a style-scope QRL argument');
        }
      }),
    };
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

/** Prints a plan-complete IR body; kinds join as examples demand them. */
export function valueIrJs(module: LinkedModule, ir: ValueIR): string {
  switch (ir.kind) {
    case ValueIrKind.SignalRead:
      return `${module.bindings[ir.binding].name}.value`;
    case ValueIrKind.BindingRead:
      return module.bindings[ir.binding].name;
    case ValueIrKind.Member:
      return `${valueIrJs(module, ir.obj)}.${ir.name}`;
    default:
      throw new UnsupportedError(`printing the IR "${ir.kind}"`);
  }
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
  const body = [
    ...emission.statements,
    ...(emission.value === '' ? [] : [`return ${emission.value};`]),
  ]
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

/** The runtime's RowOutputShape code for a row's plan Shape. */
export function rowShapeCode(shape: Shape): number {
  switch (shape) {
    case Shape.Element:
      return 0;
    case Shape.Text:
      return 1;
    case Shape.Many:
      return 2;
    case Shape.Unknown:
      return 3;
  }
}

/** What a Program-bodied QRL renders — each kind has its own emission wrapper per target. */
export const enum ProgramKind {
  Component = 'component',
  BranchArm = 'branch-arm',
  CollectionRow = 'collection-row',
  DynamicSlot = 'dynamic-slot',
  Projection = 'projection',
  SlotFallback = 'slot-fallback',
}

export function programKind(qrl: LinkedQrl): ProgramKind {
  if (qrl.boundary.kind === BoundaryKind.Component) {
    return ProgramKind.Component;
  }
  if (qrl.boundary.kind === BoundaryKind.Implicit) {
    if (qrl.ctxName === SegmentContext.ForRender) {
      return ProgramKind.CollectionRow;
    }
    if (qrl.boundary.role === 'branch') {
      return ProgramKind.BranchArm;
    }
    if (qrl.boundary.role === 'projection') {
      return ProgramKind.Projection;
    }
    if (qrl.boundary.role === 'slot-fallback') {
      return ProgramKind.SlotFallback;
    }
    if (qrl.boundary.role === 'dynamic-slot') {
      return ProgramKind.DynamicSlot;
    }
  }
  throw new UnsupportedError(`a program qrl with the boundary "${qrl.boundary.kind}"`);
}

/** The payload's authored JS with member-path reads materialized over their source ranges. */
export function extractPayloadJs(
  module: LinkedModule,
  payload: number,
  range: Range = module.payloads[payload].range
): string {
  const { reads } = module.payloads[payload];
  const [start, end] = range;
  let text = module.source.code.slice(start, end);
  // Bottom-up so earlier offsets stay valid while later reads splice.
  const materialized = reads
    .filter(
      (read) => read.memberPath !== undefined && read.range[0] >= start && read.range[1] <= end
    )
    .sort((a, b) => b.range[0] - a.range[0]);
  for (const read of materialized) {
    const member = [module.bindings[read.binding].name, ...read.memberPath!].join('.');
    const replacement =
      read.role === ReadRole.Shorthand
        ? `${module.source.code.slice(...read.range)}: ${member}`
        : member;
    text = text.slice(0, read.range[0] - start) + replacement + text.slice(read.range[1] - start);
  }
  return text;
}

/** Only an `inline`-resumed value may execute at its authored use site. */
export function inlineValueJs(module: LinkedModule, value: Value): string {
  if (value.v !== ValueKind.Computed || value.resume.r !== ResumeKind.Inline) {
    throw new UnsupportedError('a non-inline source value');
  }
  return expressionJs(module, value.expr);
}

export function expressionJs(module: LinkedModule, expr: Expr): string {
  switch (expr.kind) {
    case ExprKind.Ir:
      return valueIrJs(module, expr.ir);
    case ExprKind.Js:
      return extractPayloadJs(module, expr.payload);
    case ExprKind.Conditional:
      return `(${expressionJs(module, expr.test)}) ? (${expressionJs(module, expr.then)}) : (${expressionJs(module, expr.else)})`;
  }
}

/** Serialization roots for a use site — row-index boxes never root (the block owns them). */
export function rootArgs(qrl: LinkedQrl, args: readonly string[]): string[] {
  return args.filter((_, index) => qrl.captures[index]?.access !== CaptureAccess.RowIndex);
}

/** Positional row ABI: every param up to the LAST used one stays (unused keep their names). */
export function usedParamPrefix(module: LinkedModule, qrl: LinkedQrl): string[] {
  if (qrl.body.b !== QrlBodyKind.Program) {
    return [];
  }
  const params = module.programs[qrl.body.program].params;
  const used = new Set(qrl.params.used);
  let lastUsed = -1;
  params.forEach((binding, position) => {
    if (used.has(binding)) {
      lastUsed = position;
    }
  });
  return params.slice(0, lastUsed + 1).map((binding) => module.bindings[binding].name);
}
