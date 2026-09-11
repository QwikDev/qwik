import {
  ArgKind,
  CallTargetKind,
  CoreOperation,
  BindTargetKind,
  ExprKind,
  SetupKind,
  ValueKind,
  DeclarationKind,
  VisibleTaskEvent,
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
import { QwikGenWord, QwikHook, QwikWord } from '../words';
import { allocateGeneratedName } from '../names';
import type { ComponentEmission, GeneratedNames } from './emit-component';

const coreCallImports: Record<CoreOperation, QwikHook> = {
  [CoreOperation.CreateSignal]: QwikHook.UseSignal,
  [CoreOperation.CreateComputed]: QwikHook.UseComputedQrl,
};

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: (use: QrlUse) => string,
  render?: (program: number, names?: GeneratedNames) => ComponentEmission,
  names?: GeneratedNames,
  isServer = false
): string[] {
  return program.setup.map((entry) => {
    if (entry.s === SetupKind.Js) {
      const payload = module.payloads[entry.payload];
      const edits = (payload.setups ?? []).map(({ range, setup, block }) => {
        const value = emitJsSetup(
          module,
          { setup },
          imports,
          emitQrl,
          render,
          names,
          isServer
        ).join('\n');
        return { range, value: block ? `{\n${value}\n}` : value };
      });
      for (const { range, program, statement } of payload.renders) {
        if (render === undefined) {
          throw new UnsupportedError('a render payload without a renderer');
        }
        const emission = render(program);
        const value =
          emission.statements.length === 0
            ? emission.value
            : `(() => {\n${emission.statements.join('\n')}\nreturn ${emission.value};\n})()`;
        edits.push({
          range,
          value: statement ? `return ${value};` : value,
        });
      }
      return extractPayloadJs(module, entry.payload, payload.range, undefined, edits, emitQrl);
    }
    if (entry.s === SetupKind.LocalComponent) {
      if (render === undefined || names === undefined) {
        throw new UnsupportedError('a local component without a renderer');
      }
      const binding = entry.parameter?.surface.binding;
      const localNames = {
        ...names,
        props:
          binding == null
            ? allocateGeneratedName(
                QwikGenWord.ComponentProps,
                module.bindings.map((entry) => entry.name)
              )
            : module.bindings[binding].name,
      };
      const emission = render(entry.program, localNames);
      const body = `${emission.statements.join('\n')}\nreturn ${emission.value};`;
      const params = `${localNames.props}, ${localNames.ctx}`;
      return entry.declarationKind === DeclarationKind.Const
        ? `const ${entry.name} = (${params}) => {\n${body}\n};`
        : `function ${entry.name}(${params}) {\n${body}\n}`;
    }
    if (entry.s === SetupKind.PropRest) {
      imports.add(QwikWord.CreatePropsProxy);
      return `const ${module.bindings[entry.result].name} = ${QwikWord.CreatePropsProxy}(${module.bindings[entry.props].name}, ${JSON.stringify(entry.excluded)});`;
    }
    if (entry.s === SetupKind.PropDefault) {
      imports.add(QwikWord.Untrack);
      const prop = memberJs(module.bindings[entry.props].name, entry.name);
      const initializer = expressionJs(module, entry.initializer, emitQrl);
      return `const ${module.bindings[entry.result].name} = ${QwikWord.Untrack}(() => ${prop} === void 0) ? (${initializer}) : void 0;`;
    }
    if (entry.s === SetupKind.Call) {
      if (isServer && entry.visibleTaskEvent !== undefined) {
        // The server never runs visible tasks; the client wakes the serialized task on this event.
        const useOn =
          entry.visibleTaskEvent === VisibleTaskEvent.Visible
            ? QwikWord.UseOn
            : QwikWord.UseOnDocument;
        imports.add(useOn);
        imports.add(QwikWord.CreateVisibleTaskHandlerQrl);
        return `${useOn}(${JSON.stringify(entry.visibleTaskEvent)}, ${QwikWord.CreateVisibleTaskHandlerQrl}(${argJs(module, entry.args[0], emitQrl)}));`;
      }
      const callee = callTargetJs(module, entry.target, imports);
      const args = entry.args.map((arg) => argJs(module, arg, emitQrl)).join(', ');
      const call = `${callee}(${args})`;
      if (entry.result === null) {
        return `${call};`;
      }
      if (entry.result.bind !== BindTargetKind.Pattern) {
        throw new UnsupportedError('a call result without a binding pattern');
      }
      return `${entry.declarationKind ?? 'const'} ${extractPayloadJs(module, entry.result.pattern)} = ${call};`;
    }
    if (entry.s === SetupKind.Const && entry.result.bind === BindTargetKind.Pattern) {
      if (entry.value === undefined) {
        return `${entry.declarationKind} ${extractPayloadJs(module, entry.result.pattern)};`;
      }
      const value =
        entry.value.v === ValueKind.Qrl
          ? emitQrl(entry.value.use)
          : inlineValueJs(module, entry.value, emitQrl);
      const initial =
        entry.defaultValue === undefined
          ? value
          : `${value} === void 0 ? (${inlineValueJs(module, entry.defaultValue, emitQrl)}) : ${value}`;
      return `${entry.declarationKind ?? 'const'} ${extractPayloadJs(module, entry.result.pattern)} = ${initial};`;
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
      return expressionJs(module, arg.expr, emitQrl);
    case ArgKind.Spread:
      return `...(${expressionJs(module, arg.expr, emitQrl)})`;
    case ArgKind.Value:
      return arg.value.v === ValueKind.Qrl
        ? emitQrl(arg.value.use)
        : inlineValueJs(module, arg.value, emitQrl);
  }
}

/** The signal local a `Read` hole subscribes — resolved from its SignalRead IR. */
export function signalReadName(module: LinkedModule, expr: Expr): string {
  if (expr.kind !== ExprKind.Ir || expr.ir.kind !== ValueIrKind.SignalRead) {
    throw new UnsupportedError('a read hole without signal-read IR');
  }
  return module.bindings[expr.ir.binding].name;
}
