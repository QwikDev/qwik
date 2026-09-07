import {
  ArgKind,
  CallTargetKind,
  CoreOperation,
  BindTargetKind,
  ExprKind,
  SetupKind,
  ValueKind,
  type QrlUse,
  type Arg,
  type Expr,
  type LinkedModule,
  type CallTarget,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { UnsupportedError } from '../errors';
import { expressionJs, extractPayloadJs, inlineValueJs, memberJs, valueIrJs } from './emit-chunk';
import { requestBindingImport } from './emit-import';
import { QwikHook, QwikWord } from '../words';

const coreCallImports: Record<CoreOperation, QwikHook> = {
  [CoreOperation.CreateSignal]: QwikHook.UseSignal,
  [CoreOperation.CreateComputed]: QwikHook.UseComputedQrl,
};

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: (use: QrlUse) => string
): string[] {
  return program.setup.map((entry) => {
    if (entry.s === SetupKind.PropRest) {
      imports.add(QwikWord.CreatePropsProxy);
      return `const ${module.bindings[entry.result].name} = ${QwikWord.CreatePropsProxy}(${module.bindings[entry.props].name}, ${JSON.stringify(entry.excluded)});`;
    }
    if (entry.s === SetupKind.PropDefault) {
      imports.add(QwikWord.Untrack);
      const prop = memberJs(module.bindings[entry.props].name, entry.name);
      const initializer = expressionJs(module, entry.initializer);
      return `const ${module.bindings[entry.result].name} = ${QwikWord.Untrack}(() => ${prop} === void 0) ? (${initializer}) : void 0;`;
    }
    if (entry.s === SetupKind.Call) {
      const callee = callTargetJs(module, entry.target, imports);
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

function callTargetJs(module: LinkedModule, target: CallTarget, imports: Set<string>): string {
  switch (target.kind) {
    case CallTargetKind.Binding:
      requestBindingImport(module, target.binding, imports);
      return module.bindings[target.binding].name;
    case CallTargetKind.Core: {
      const name = coreCallImports[target.operation];
      imports.add(name);
      return name;
    }
    case CallTargetKind.Value:
      return `(0, ${valueIrJs(module, target.value)})`;
  }
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
