import {
  ArgKind,
  CallTargetKind,
  CoreOperation,
  BindTargetKind,
  ExprKind,
  SetupKind,
  ValueKind,
  DeclarationKind,
  HookTwinKind,
  VisibleTaskEvent,
  type HookTwin,
  type QrlUse,
  type Arg,
  type Expr,
  type LinkedModule,
  type CallTarget,
  type Setup,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { UnsupportedError } from '../errors';
import { expressionJs, extractPayloadJs, inlineValueJs, memberJs, valueIrJs } from './emit-chunk';
import { namedSpecifier, requestBindingImport } from './emit-import';
import { QwikGenWord, QwikHook, QwikWord } from '../words';
import { allocateGeneratedName } from '../names';
import type { ComponentEmission, GeneratedNames } from './emit-component';

/** Runtime names per core operation: the `Qrl` form and the client function fast path. */
const coreCallNames: Record<CoreOperation, { qrl: QwikHook; fn: QwikHook }> = {
  [CoreOperation.CreateSignal]: { qrl: QwikHook.UseSignal, fn: QwikHook.UseSignal },
  [CoreOperation.CreateComputed]: {
    qrl: QwikHook.UseComputedQrl,
    fn: QwikHook.UseComputedFunction,
  },
  [CoreOperation.Task]: { qrl: QwikHook.UseTaskQrl, fn: QwikHook.UseTaskFunction },
  [CoreOperation.VisibleTask]: {
    qrl: QwikHook.UseVisibleTaskQrl,
    fn: QwikHook.UseVisibleTaskFunction,
  },
};

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: (use: QrlUse) => string,
  render?: (program: number, names?: GeneratedNames) => ComponentEmission,
  names?: GeneratedNames,
  target: SetupEmitTarget = {}
): string[] {
  return program.setup.map((entry) => {
    if (entry.s === SetupKind.Js) {
      const payload = module.payloads[entry.payload];
      const edits = (payload.setups ?? []).map(({ range, setup, block }) => {
        const value = emitJsSetup(module, { setup }, imports, emitQrl, render, names, target).join(
          '\n'
        );
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
      if (target.isServer && entry.visibleTaskEvent !== undefined) {
        // The server never runs visible tasks; the client wakes the serialized task on this event.
        const useOn =
          entry.visibleTaskEvent === VisibleTaskEvent.Visible
            ? QwikWord.UseOn
            : QwikWord.UseOnDocument;
        imports.add(useOn);
        imports.add(QwikWord.CreateVisibleTaskHandlerQrl);
        return `${useOn}(${JSON.stringify(entry.visibleTaskEvent)}, ${QwikWord.CreateVisibleTaskHandlerQrl}(${argJs(module, entry.args[0], emitQrl)}));`;
      }
      const [first] = entry.args;
      // The client fast path: the callback ships with the component as a plain function.
      const isFunctionTwin =
        target.staticQrl !== undefined &&
        first?.a === ArgKind.Qrl &&
        (entry.target.kind === CallTargetKind.Core || entry.target.kind === CallTargetKind.Marker);
      const callee = hookCalleeJs(module, entry.target, isFunctionTwin, imports, target);
      const args = entry.args.map((arg, index) =>
        isFunctionTwin && index === 0 && arg.a === ArgKind.Qrl
          ? target.staticQrl!(arg.use)
          : argJs(module, arg, emitQrl)
      );
      const call = `${callee}(${args.join(', ')})`;
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

export interface SetupEmitTarget {
  /** SSR registers visible tasks as events and keeps task hooks on their QRLs. */
  isServer?: boolean;
  /** CSR delivers hook callbacks statically, as plain functions with their captures. */
  staticQrl?: (use: QrlUse) => string;
  /** Header import lines of the module emitter, for hook twins outside `@qwik.dev/core`. */
  chunkImports?: string[];
}

/** Whether any setup hook, including those nested in authored statements, may start a task. */
export function blocksInitialRender(module: LinkedModule, setup: readonly Setup[]): boolean {
  return setup.some((entry) =>
    entry.s === SetupKind.Call
      ? entry.blocksInitialRender === true
      : entry.s === SetupKind.Js &&
        (module.payloads[entry.payload].setups ?? []).some((nested) =>
          blocksInitialRender(module, nested.setup)
        )
  );
}

/**
 * Defers the render after `setupCount` statements until `pending` settles, keeping the invoke
 * context.
 */
export function deferRenderAfterTasks(
  imports: Set<string>,
  next: (prefix: string) => string,
  pending: (invokeContext: string) => string,
  statements: readonly string[],
  setupCount: number,
  value: string
): ComponentEmission {
  imports.add(QwikWord.GetActiveInvokeContextOrNull);
  imports.add(QwikWord.MaybeThen);
  imports.add(QwikWord.Invoke);
  const invokeContext = next(QwikGenWord.InvokeContext);
  const body = `{\n${statements.slice(setupCount).join('\n')}\nreturn ${value};\n}`;
  return {
    statements: [
      `const ${invokeContext} = ${QwikWord.GetActiveInvokeContextOrNull}();`,
      ...statements.slice(0, setupCount),
    ],
    value: `${QwikWord.MaybeThen}(${pending(invokeContext)}, () => ${QwikWord.Invoke}(${invokeContext}, () => ${body}))`,
  };
}

function hookCalleeJs(
  module: LinkedModule,
  target: CallTarget,
  isFunctionTwin: boolean,
  imports: Set<string>,
  emitter: SetupEmitTarget
): string {
  const form = isFunctionTwin ? 'fn' : 'qrl';
  switch (target.kind) {
    case CallTargetKind.Binding:
      requestBindingImport(module, target.binding, imports);
      return module.bindings[target.binding].name;
    case CallTargetKind.Core: {
      const name = coreCallNames[target.operation][form];
      imports.add(name);
      return name;
    }
    case CallTargetKind.Value:
      return `(0, ${valueIrJs(module, target.value)})`;
    case CallTargetKind.Marker: {
      if (target.twins === undefined) {
        throw new UnsupportedError(`${target.stem}$ without its ${form} twin`);
      }
      return hookTwinJs(module, target.twins[form], emitter.chunkImports);
    }
  }
}

function hookTwinJs(
  module: LinkedModule,
  twin: HookTwin,
  chunkImports: string[] | undefined
): string {
  if (twin.t === HookTwinKind.Binding) {
    return module.bindings[twin.binding].name;
  }
  if (chunkImports === undefined) {
    throw new UnsupportedError(`importing ${twin.imported} outside a module emitter`);
  }
  const line = `import { ${namedSpecifier(twin.imported, twin.local)} } from ${JSON.stringify(module.edges[twin.edge].specifier)};`;
  if (!chunkImports.includes(line)) {
    chunkImports.push(line);
  }
  return twin.local;
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
