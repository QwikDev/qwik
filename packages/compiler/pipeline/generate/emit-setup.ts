import {
  ArgKind,
  BindTargetKind,
  ExprKind,
  SetupKind,
  ValueKind,
  type QrlUse,
  type Arg,
  type Expr,
  type LinkedModule,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { UnsupportedError } from '../errors';
import { expressionJs, extractPayloadJs, inlineValueJs } from './emit-chunk';
import { requestBindingImport } from './emit-import';

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: (use: QrlUse) => string
): string[] {
  return program.setup.map((entry) => {
    if (entry.s === SetupKind.Call) {
      if (entry.importName === undefined) {
        requestBindingImport(module, entry.binding, imports);
      } else {
        imports.add(entry.importName);
      }
      const callee = entry.importName ?? module.bindings[entry.binding].name;
      const args = entry.args.map((arg) => argJs(module, arg, emitQrl)).join(', ');
      const call = `${callee}(${args})`;
      if (entry.result === null) {
        return `${call};`;
      }
      if (entry.result.bind !== BindTargetKind.Pattern) {
        throw new UnsupportedError('a call result without a binding pattern');
      }
      return `const ${extractPayloadJs(module, entry.result.pattern)} = ${call};`;
    }
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
    throw new UnsupportedError(`the setup entry "${entry.s}" in a JS render`);
  });
}

function argJs(module: LinkedModule, arg: Arg, emitQrl: (use: QrlUse) => string): string {
  switch (arg.a) {
    case ArgKind.Qrl:
      return emitQrl(arg.use);
    case ArgKind.QrlBinding:
      return module.bindings[arg.binding].name;
    case ArgKind.Expr:
      return expressionJs(module, arg.expr);
    case ArgKind.Spread:
      return `...(${expressionJs(module, arg.expr)})`;
    case ArgKind.Value:
      return arg.value.v === ValueKind.Qrl
        ? emitQrl(arg.value.use)
        : inlineValueJs(module, arg.value);
  }
}

/** The signal local a `Read` hole subscribes — resolved from its SignalRead IR. */
export function signalReadName(module: LinkedModule, expr: Expr): string {
  if (expr.kind !== ExprKind.Ir || expr.ir.kind !== ValueIrKind.SignalRead) {
    throw new UnsupportedError('a read hole without signal-read IR');
  }
  return module.bindings[expr.ir.binding].name;
}
