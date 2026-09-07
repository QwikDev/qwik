import {
  ArgKind,
  BindTargetKind,
  ExprKind,
  InvokeKind,
  SetupKind,
  ValueKind,
  type QrlUse,
  type Arg,
  type Expr,
  type LinkedModule,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { QwikHook } from '../words';
import { UnsupportedError } from '../errors';
import { extractPayloadJs, inlineValueJs } from './emit-chunk';

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: (use: QrlUse) => string
): string[] {
  return program.setup.map((entry) => {
    if (entry.s === SetupKind.Const && entry.result.bind === BindTargetKind.Pattern) {
      const value =
        entry.value.v === ValueKind.Qrl
          ? emitQrl(entry.value.use)
          : inlineValueJs(module, entry.value);
      const initial =
        entry.defaultValue === undefined
          ? value
          : `${value} === void 0 ? (${inlineValueJs(module, entry.defaultValue)}) : ${value}`;
      return `const ${extractPayloadJs(module, entry.result.pattern)} = ${initial};`;
    }
    if (
      entry.s !== SetupKind.Invoke ||
      (entry.invoke.op !== InvokeKind.UseSignal && entry.invoke.op !== InvokeKind.UseComputed)
    ) {
      throw new UnsupportedError(`the setup entry "${entry.s}" in a JS render`);
    }
    const result = entry.invoke.result;
    if (result.bind !== BindTargetKind.Pattern || result.bindings.length !== 1) {
      throw new UnsupportedError('a non-identifier signal hook binding');
    }
    const name = module.bindings[result.bindings[0]].name;
    const hook =
      entry.invoke.op === InvokeKind.UseComputed ? QwikHook.UseComputedQrl : QwikHook.UseSignal;
    imports.add(hook);
    const initial =
      entry.invoke.op === InvokeKind.UseComputed
        ? emitQrl(entry.invoke.qrl)
        : entry.invoke.initial === undefined
          ? ''
          : argJs(module, entry.invoke.initial);
    return `const ${name} = ${hook}(${initial});`;
  });
}

function argJs(module: LinkedModule, arg: Arg): string {
  if (arg.a !== ArgKind.Expr) {
    throw new UnsupportedError(`the arg kind "${arg.a}" in a JS render`);
  }
  if (arg.expr.kind === ExprKind.Js) {
    const [start, end] = module.payloads[arg.expr.payload].range;
    return module.source.code.slice(start, end);
  }
  if (arg.expr.kind !== ExprKind.Ir) {
    throw new UnsupportedError(`the expression "${arg.expr.kind}" as a JS argument`);
  }
  const ir = arg.expr.ir;
  if (ir.kind !== ValueIrKind.Lit) {
    throw new UnsupportedError(`the IR "${ir.kind}" as a JS argument`);
  }
  return JSON.stringify(ir.value);
}

/** The signal local a `Read` hole subscribes — resolved from its SignalRead IR. */
export function signalReadName(module: LinkedModule, expr: Expr): string {
  if (expr.kind !== ExprKind.Ir || expr.ir.kind !== ValueIrKind.SignalRead) {
    throw new UnsupportedError('a read hole without signal-read IR');
  }
  return module.bindings[expr.ir.binding].name;
}
