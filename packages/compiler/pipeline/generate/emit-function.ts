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
} from '../schema';
import { UnsupportedError } from '../errors';
import { QwikWord } from '../words';
import {
  captureNames,
  capturePrelude,
  emptyFunctionEmission,
  extractPayloadJs,
  qrlPropsName,
  type QrlResolver,
  expressionJs,
  type FunctionEmission,
} from './emit-chunk';
import { emitJsSetup } from './emit-setup';
import { createNameAllocator } from './names';

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
    emission.statements.push(...capturePrelude(captures));
  }
  const emitQrl = (use: QrlUse) =>
    emitFunctionQrl(use, qrlPropsName(module, qrl, 'props'), emission, resolveQrlUse, true);
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
      emission.functionName = null;
      emission.value = `(${readSource(module.payloads[body.payload].range)}).apply(this, arguments)`;
      return emission;
    }
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
      ? `{ ${qrl.propsParts.map((part) => propsPartJs(module, qrl, part, emission, resolveQrlUse)).join(', ')} }`
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
  resolveQrlUse: QrlResolver
): string {
  switch (part.kind) {
    case PropsPartKind.Static:
      return `${JSON.stringify(part.name)}: ${JSON.stringify(part.value)}`;
    case PropsPartKind.Expression:
      return `${JSON.stringify(part.name)}: ${extractPayloadJs(module, part.value)}`;
    case PropsPartKind.Spread:
      return `...${extractPayloadJs(module, part.value)}`;
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
