/**
 * Prints authored payload slices and IR values as JavaScript — the one place source text is
 * spliced.
 */
import {
  CallTargetKind,
  type CallTarget,
  ExprKind,
  ReadRole,
  ResumeKind,
  ValueKind,
  type LinkedModule,
  type QrlUse,
  type Value,
  type Expr,
  type ExpressionIR,
  type Range,
  type LocalId,
} from '../schema';
import { ValueIrKind } from '../schema/value-ir';
import { QwikWord } from '../words';
import { UnsupportedError } from '../errors';
import type { FunctionEmission } from './emit-function';
type MarkerTarget = Extract<CallTarget, { kind: CallTargetKind.Marker }>;

/** Prints a QRL use; `marker` also prints a custom `$` hook call as its twin plus callback. */
export type EmitQrl = ((use: QrlUse) => string) & {
  marker?: (target: MarkerTarget, use: QrlUse) => { callee: string; argument: string };
};

/** Materializes payload edits together so nested source ranges remain valid. */
export function extractPayloadJs(
  module: LinkedModule,
  payload: number,
  range: Range = module.payloads[payload].range,
  awaitName: string = QwikWord.Await,
  edits: { range: Range; value: string }[] = [],
  emitQrl?: EmitQrl
): string {
  const { reads, awaits, constants } = module.payloads[payload];
  const [start, end] = range;
  const replacements: { range: Range; value: string }[] = [...edits];
  for (const entry of module.payloads[payload].qrls) {
    if (
      entry.range[0] < start ||
      entry.range[1] > end ||
      edits.some(({ range }) => entry.range[0] >= range[0] && entry.range[1] <= range[1])
    ) {
      continue;
    }
    if (emitQrl === undefined) {
      throw new UnsupportedError('an embedded QRL without an emitter');
    }
    if (entry.marker === undefined) {
      replacements.push({ range: entry.range, value: emitQrl(entry.use) });
      continue;
    }
    if (emitQrl.marker === undefined) {
      throw new UnsupportedError(`${entry.marker.target.stem}$ inside this payload`);
    }
    const { callee, argument } = emitQrl.marker(entry.marker.target, entry.use);
    replacements.push(
      { range: entry.marker.calleeRange, value: callee },
      { range: entry.range, value: argument }
    );
  }
  const materialized = reads.filter(
    (read) =>
      read.value !== undefined &&
      read.range[0] >= start &&
      read.range[1] <= end &&
      !replacements.some(({ range }) => read.range[0] >= range[0] && read.range[1] <= range[1])
  );
  for (const read of materialized) {
    const member = valueIrJs(module, read.value!);
    let replacement = member;
    if (read.role === ReadRole.Shorthand) {
      replacement = `${module.source.code.slice(...read.range)}: ${member}`;
    } else if (read.role === ReadRole.Call) {
      replacement = `(0, ${member})`;
    }
    replacements.push({ range: read.range, value: replacement });
  }
  for (const constant of constants) {
    if (constant.value === undefined || constant.range[0] < start || constant.range[1] > end) {
      continue;
    }
    // A shorthand property loses its key when the value stops being a name.
    const literal = String(constant.value);
    replacements.push({
      range: constant.range,
      value:
        constant.role === ReadRole.Shorthand
          ? `${module.source.code.slice(...constant.range)}: ${literal}`
          : literal,
    });
  }
  for (const {
    range: [awaitStart, awaitEnd],
  } of awaits) {
    if (awaitStart >= start && awaitEnd <= end) {
      // The keyword and the whitespace after it go; a comment between them stays authored.
      let keywordEnd = awaitStart + 'await'.length;
      while (keywordEnd < awaitEnd && /\s/.test(module.source.code[keywordEnd])) {
        keywordEnd++;
      }
      replacements.push(
        { range: [awaitStart, keywordEnd], value: `(await ${awaitName}(` },
        { range: [awaitEnd, awaitEnd], value: '))()' }
      );
    }
  }
  return applyReplacements(module.source.code, range, replacements);
}

/** Prints a plan-complete IR body; kinds join as examples demand them. */
export function valueIrJs(module: LinkedModule, ir: ExpressionIR): string {
  switch (ir.kind) {
    case ExprKind.Js:
      return `(${extractPayloadJs(module, ir.payload)})`;
    case ValueIrKind.Lit:
      return JSON.stringify(ir.value);
    case ValueIrKind.Cond:
      return `(${valueIrJs(module, ir.test)} ? ${valueIrJs(module, ir.then)} : ${valueIrJs(module, ir.else)})`;
    case ValueIrKind.Bin:
      return `${valueIrJs(module, ir.left)} ${ir.op} ${valueIrJs(module, ir.right)}`;
    case ValueIrKind.Undef:
      return 'void 0';
    case ValueIrKind.Template:
      return `\`${ir.parts
        .map((part) =>
          typeof part === 'string'
            ? part.replace(/[\\`]|\$\{/g, '\\$&')
            : `\${${valueIrJs(module, part)}}`
        )
        .join('')}\``;
    case ValueIrKind.SignalRead:
      return `${module.bindings[ir.binding].name}.value`;
    case ValueIrKind.BindingRead:
      return module.bindings[ir.binding].name;
    case ValueIrKind.Member:
      return memberJs(valueIrJs(module, ir.obj), ir.name);
    case ValueIrKind.Index:
      return `${valueIrJs(module, ir.obj)}[${valueIrJs(module, ir.key)}]`;
    case ValueIrKind.PropRead: {
      const prop = memberJs(module.bindings[ir.binding].name, ir.name);
      return `(${prop} === void 0 ? ${valueIrJs(module, ir.fallback)} : ${prop})`;
    }
    default:
      throw new UnsupportedError(`printing the IR "${ir.kind}"`);
  }
}

export function memberJs(base: string, name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `${base}.${name}` : `${base}[${JSON.stringify(name)}]`;
}

/** Only an `inline`-resumed value may execute at its authored use site. */
export function inlineValueJs(module: LinkedModule, value: Value, emitQrl?: EmitQrl): string {
  if (value.v !== ValueKind.Computed || value.resume.r !== ResumeKind.Inline) {
    throw new UnsupportedError('a non-inline source value');
  }
  return expressionJs(module, value.expr, emitQrl);
}

/** The runtime write-back handler of a two-way binding, capturing its signal. */
export function bindHandlerJs(
  module: LinkedModule,
  handler: { signal: LocalId; checked: boolean },
  imports: Set<string>
): string {
  const symbol = handler.checked ? QwikWord.BindCheckedHandler : QwikWord.BindValueHandler;
  imports.add(QwikWord.InlinedQrl);
  imports.add(symbol);
  return `${QwikWord.InlinedQrl}(${symbol}, '${symbol}', [${module.bindings[handler.signal].name}])`;
}

export function expressionJs(module: LinkedModule, expr: Expr, emitQrl?: EmitQrl): string {
  switch (expr.kind) {
    case ExprKind.Ir:
      return valueIrJs(module, expr.ir);
    case ExprKind.Js:
      return extractPayloadJs(module, expr.payload, undefined, undefined, [], emitQrl);
  }
}

/** Splices replacements into a slice of the module source, last range first. */
function applyReplacements(
  source: string,
  range: Range,
  replacements: readonly { range: Range; value: string }[]
): string {
  let code = source.slice(range[0], range[1]);
  for (const replacement of [...replacements].sort(
    (left, right) => right.range[0] - left.range[0]
  )) {
    const start = replacement.range[0] - range[0];
    const end = replacement.range[1] - range[0];
    code = `${code.slice(0, start)}${replacement.value}${code.slice(end)}`;
  }
  return code;
}
/** Chunks and SSR mirrors share the same function syntax. */
export function functionText(emission: FunctionEmission): string {
  if (emission.alias !== undefined) {
    return emission.alias;
  }
  const body = [
    ...emission.statements,
    ...(emission.value === '' ? [] : [`return ${emission.value};`]),
  ]
    .map((statement) => `  ${statement}`)
    .join('\n');
  const params = `(${emission.params.join(', ')})`;
  const head =
    emission.functionName === undefined
      ? `${params} =>`
      : `function${emission.generator ? '*' : ''}${emission.functionName === null ? '' : ` ${emission.functionName}`}${params}`;
  return `${emission.async ? 'async ' : ''}${head} {\n${body}\n}`;
}
