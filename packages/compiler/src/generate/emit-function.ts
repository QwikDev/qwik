import {
  BoundaryKind,
  FnBodyKind,
  ProgramBodyKind,
  PropsPartKind,
  QrlBodyKind,
  QrlPayloadKind,
  type LinkedModule,
  type LinkedQrl,
  type Range,
  type QrlUse,
  Shape,
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikWord, SegmentContext } from '../words';
import {
  captureNames,
  capturePrelude,
  functionPrelude,
  staticFunctionReference,
  qrlPropsName,
} from './captures';
import { extractPayloadJs, expressionJs, type EmitQrl } from './print-js';
import { type QrlResolver } from './qrl-chunks';
import { emitJsSetup, withMarkerEmitter } from './emit-setup';
import { createNameAllocator } from '../names';

/** QRL functions share capture restoration across authored and lowered bodies. */
export function sourceFunctionEmission(
  module: LinkedModule,
  qrl: LinkedQrl,
  resolveQrlUse: QrlResolver
): FunctionEmission {
  const captures = captureNames(module, qrl);
  const emission = emptyFunctionEmission();
  if (qrl.payloadKind === QrlPayloadKind.Function && captures.length > 0) {
    emission.imports.add(QwikWord.Captures);
  }
  const propsName = qrlPropsName(module, qrl, 'props');
  emission.statements.push(
    ...capturePrelude(module, qrl),
    ...functionPrelude(module, qrl, (use) =>
      staticFunctionReference(module, use, propsName, emission, resolveQrlUse)
    )
  );
  const emitQrl = withMarkerEmitter(
    module,
    emission.imports,
    (use: QrlUse) =>
      emitFunctionQrl(use, qrlPropsName(module, qrl, 'props'), emission, resolveQrlUse, true),
    emission.chunkImports
  );
  const body = qrl.body;
  let awaitName: string = QwikWord.Await;
  if (body.b === QrlBodyKind.Js && module.payloads[body.payload].awaits.length > 0) {
    if (module.bindings.some((binding) => binding.name === awaitName)) {
      awaitName = createNameAllocator(module)(QwikWord.Await);
    }
    emission.imports.add(
      awaitName === QwikWord.Await ? awaitName : `${QwikWord.Await} as ${awaitName}`
    );
  }
  const readSource = (range: Range) =>
    body.b === QrlBodyKind.Js
      ? extractPayloadJs(module, body.payload, range, awaitName, [], emitQrl)
      : module.source.code.slice(...range);
  if (body.b === QrlBodyKind.Js && body.functionName !== undefined) {
    emission.functionName = body.functionName;
    if (captures.length > 0 && (body.functionName !== null || qrl.params.capturesBeforeParams)) {
      // the authored text keeps its own head, generator star included; this wrapper only applies it
      emission.functionName = null;
      emission.value = `(${readSource(module.payloads[body.payload].range)}).apply(this, arguments)`;
      return emission;
    }
    emission.generator = body.generator === true;
  }
  // Native parameter scopes preserve defaults, closures, and mutable bindings.
  if (body.b === QrlBodyKind.Js && qrl.params.capturesBeforeParams) {
    const args = createNameAllocator(module)('args');
    emission.params = [`...${args}`];
    emission.value = `(${readSource(module.payloads[body.payload].range)})(...${args})`;
    return emission;
  }
  if (body.b === QrlBodyKind.Program) {
    const program = module.programs[body.program];
    if (program.body.kind !== ProgramBodyKind.Expr) {
      throw new UnsupportedError('an expression function with render operations');
    }
    emission.params = program.params.map((binding) => module.bindings[binding].name);
    emission.statements.push(
      ...emitJsSetup(module, program, emission.imports, (use) =>
        emitFunctionQrl(use, qrlPropsName(module, qrl, 'props'), emission, resolveQrlUse, true)
      )
    );
    emission.value = expressionJs(module, program.body.expr, emitQrl);
    emission.async = program.async;
    return emission;
  }
  emission.params =
    qrl.payloadKind === QrlPayloadKind.Value ? captures : qrl.origin.paramRanges.map(readSource);
  emission.async = qrl.authoredAsync;
  if (qrl.origin.bodyKind === FnBodyKind.Block) {
    const [start, end] = qrl.origin.bodyRange;
    emission.statements.push(readSource([start + 1, end - 1]).trim());
    return emission;
  }
  // IR bodies preserve lowered aliases instead of replaying authored identifiers.
  emission.value =
    qrl.propsParts.length > 0
      ? `{ ${qrl.propsParts.map((part) => propsPartJs(module, qrl, part, emission, resolveQrlUse, emitQrl)).join(', ')} }`
      : body.b === QrlBodyKind.Expr
        ? expressionJs(module, body.expr, emitQrl)
        : readSource(qrl.origin.bodyRange);
  return emission;
}

function propsPartJs(
  module: LinkedModule,
  owner: LinkedQrl,
  part: LinkedQrl['propsParts'][number],
  emission: FunctionEmission,
  resolveQrlUse: QrlResolver,
  emitQrl: EmitQrl
): string {
  switch (part.kind) {
    case PropsPartKind.Static:
      return `${JSON.stringify(part.name)}: ${JSON.stringify(part.value)}`;
    case PropsPartKind.Expression:
      return `${JSON.stringify(part.name)}: ${extractPayloadJs(module, part.value, undefined, undefined, [], emitQrl)}`;
    case PropsPartKind.Spread:
      return `...${extractPayloadJs(module, part.value, undefined, undefined, [], emitQrl)}`;
    case PropsPartKind.Event: {
      return `${JSON.stringify(part.name)}: ${emitFunctionQrl(part.use, qrlPropsName(module, owner, 'props'), emission, resolveQrlUse, false)}`;
    }
  }
}

function emitFunctionQrl(
  use: QrlUse,
  propsName: string,
  emission: FunctionEmission,
  resolveQrlUse: QrlResolver,
  invoked: boolean
): string {
  const { qrl, args } = resolveQrlUse(use, propsName);
  if (qrl.payloadKind !== QrlPayloadKind.Function) {
    throw new UnsupportedError('a non-function QRL');
  }
  const usage = emission.uses.find((usage) => usage.qrl.id === qrl.id);
  if (usage === undefined) {
    emission.uses.push({ qrl, invoked });
  } else {
    usage.invoked ||= invoked;
  }
  const reference = `q_${qrl.name}`;
  return args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`;
}

/** Content expressions render inside their caller-owned range. */
export function contentFunctionEmission(
  module: LinkedModule,
  qrl: LinkedQrl,
  resolveQrlUse: QrlResolver,
  helper: QwikWord.CreateDynamicContent | QwikWord.RenderSsrDynamicContent
): FunctionEmission {
  const emission = sourceFunctionEmission(module, qrl, resolveQrlUse);
  if (qrl.boundary.kind === BoundaryKind.Implicit && qrl.boundary.role === 'content') {
    const ctx = createNameAllocator(module)('ctx');
    emission.params = [ctx];
    emission.imports.add(helper);
    emission.value = `${helper}(${emission.value}, ${ctx})`;
  }
  return emission;
}

/** One function, as neutral data — printed into chunk files, SSR mirrors, and spliced bodies. */
export interface FunctionEmission {
  /** `$(Name)`: the segment is that binding, so it prints as the name instead of a function. */
  alias?: string;
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
  /** Undefined denotes arrows; null denotes anonymous function expressions. */
  functionName?: string | null;
  generator: boolean;
  /** QRLs the function's body references — the placement satisfies them. */
  uses: { qrl: LinkedQrl; invoked: boolean }[];
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
    generator: false,
    uses: [],
  };
}

/** A dynamic slot's content range re-resolves the slot through the target's runtime helper. */
export function dynamicSlotEmission(helper: QwikWord): FunctionEmission {
  const emission = emptyFunctionEmission();
  emission.imports.add(helper);
  emission.params = ['ctx', 'scope', 'name', 'fallback'];
  emission.value = `${helper}(ctx, scope, name, fallback)`;
  return emission;
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
    if (
      [
        SegmentContext.DynamicSlot,
        SegmentContext.DynamicTag,
        SegmentContext.SuspenseContent,
        SegmentContext.SuspenseFallback,
        'jsx-value',
      ].includes(qrl.boundary.role)
    ) {
      return ProgramKind.Content;
    }
  }
  throw new UnsupportedError(`a program qrl with the boundary "${qrl.boundary.kind}"`);
}

/** What a Program-bodied QRL renders — each kind has its own emission wrapper per target. */
export const enum ProgramKind {
  Component = 'component',
  BranchArm = 'branch-arm',
  CollectionRow = 'collection-row',
  Content = 'content',
  Projection = 'projection',
  SlotFallback = 'slot-fallback',
}

/** A `$(Name)` segment: nothing to build, the binding itself is the value. */
export function aliasEmission(module: LinkedModule, binding: number): FunctionEmission {
  const emission = emptyFunctionEmission();
  emission.alias = module.bindings[binding].name;
  return emission;
}
