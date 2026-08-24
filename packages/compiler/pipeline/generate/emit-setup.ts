import {
  ArgKind,
  BindTargetKind,
  ExprKind,
  InvokeKind,
  SetupKind,
  type Arg,
  type Expr,
  type LinkedModule,
  type Program,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { QwikWord } from '../words';
import { UnsupportedError } from '../errors';

/** Setup statements shared by the JS targets — `const count = useSignal(0);`. */
export function emitJsSetup(
  module: LinkedModule,
  program: Program,
  imports: Set<string>
): string[] {
  return program.setup.map((entry) => {
    if (entry.s !== SetupKind.Invoke || entry.invoke.op !== InvokeKind.UseSignal) {
      throw new UnsupportedError(`the setup entry "${entry.s}" in a JS render`);
    }
    const result = entry.invoke.result;
    if (result.bind !== BindTargetKind.Pattern || result.bindings.length !== 1) {
      throw new UnsupportedError('a non-identifier useSignal binding');
    }
    const name = module.bindings[result.bindings[0]].name;
    imports.add(QwikWord.UseSignal);
    const initial = entry.invoke.initial === undefined ? '' : argJs(module, entry.invoke.initial);
    return `const ${name} = ${QwikWord.UseSignal}(${initial});`;
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
