import {
  FnBodyKind,
  ProgramBodyKind,
  PropsPartKind,
  QrlBodyKind,
  QrlPayloadKind,
  type LinkedModule,
  type LinkedQrl,
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

/** Expression QRLs share capture restoration across authored and lowered bodies. */
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
  const body = qrl.body;
  if (body.b === QrlBodyKind.Program) {
    const program = module.programs[body.program];
    if (program.body.kind !== ProgramBodyKind.Expr) {
      throw new UnsupportedError('an expression function with render operations');
    }
    emission.params = program.params.map((binding) => module.bindings[binding].name);
    emission.statements.push(...emitJsSetup(module, program, emission.imports));
    emission.value = expressionJs(module, program.body.expr);
    emission.async = program.async;
    return emission;
  }
  if (qrl.origin.bodyKind !== FnBodyKind.Expression) {
    throw new UnsupportedError('emitting a chunk for a block QRL body');
  }
  const source = module.source.code;
  emission.params =
    qrl.payloadKind === QrlPayloadKind.Value
      ? captures
      : qrl.origin.paramRanges.map(([start, end]) => source.slice(start, end));
  // IR bodies preserve lowered aliases instead of replaying authored identifiers.
  emission.value =
    qrl.propsParts.length > 0
      ? `{ ${qrl.propsParts.map((part) => propsPartJs(module, qrl, part, emission, resolveQrlUse)).join(', ')} }`
      : body.b === QrlBodyKind.Expr
        ? expressionJs(module, body.expr)
        : source.slice(qrl.origin.bodyRange[0], qrl.origin.bodyRange[1]);
  emission.async = qrl.authoredAsync;
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
      const { qrl, args } = resolveQrlUse(part.use, qrlPropsName(module, owner, 'props'));
      if (qrl.payloadKind !== QrlPayloadKind.Function) {
        throw new UnsupportedError('a non-function component event QRL');
      }
      if (!emission.uses.some((usage) => usage.qrl.id === qrl.id)) {
        emission.uses.push({ qrl, invoked: false });
      }
      const reference = `q_${qrl.name}`;
      return `${JSON.stringify(part.name)}: ${args.length === 0 ? reference : `${reference}.w([${args.join(', ')}])`}`;
    }
  }
}
