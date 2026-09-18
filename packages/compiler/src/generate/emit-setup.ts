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
  type HookTwin,
  type QrlUse,
  type Arg,
  type Expr,
  type LinkedModule,
  type BindTarget,
  type CallTarget,
  type HookDecl,
  FnBodyKind,
  HookBodyKind,
  type Maybe,
} from '../schema';
import { ValueIrKind } from '../schema/value-ir';
import { UnsupportedError } from '../errors';
import { expressionJs, extractPayloadJs, inlineValueJs, valueIrJs, type EmitQrl } from './print-js';
import { namedSpecifier, requestBindingImport } from './emit-import';
import { QwikGenWord, QwikHook, QwikWord } from '../words';
import { allocateGeneratedName } from '../names';
import type { ComponentEmission, GeneratedNames } from './emit-component';

/** Runtime names per core operation: the `Qrl` form and the client function fast path. */
const coreCallNames: Record<CoreOperation, { qrl: QwikHook; fn: QwikHook }> = {
  [CoreOperation.CreateSignal]: { qrl: QwikHook.UseSignal, fn: QwikHook.UseSignal },
  [CoreOperation.CreateStore]: { qrl: QwikHook.UseStore, fn: QwikHook.UseStore },
  [CoreOperation.UseId]: { qrl: QwikHook.UseId, fn: QwikHook.UseId },
  [CoreOperation.ChildrenInfo]: { qrl: QwikHook.UseChildrenInfo, fn: QwikHook.UseChildrenInfo },
  [CoreOperation.CreateComputed]: {
    qrl: QwikHook.UseComputedQrl,
    fn: QwikHook.UseComputedFunction,
  },
  [CoreOperation.Task]: { qrl: QwikHook.UseTaskQrl, fn: QwikHook.UseTaskFunction },
  [CoreOperation.VisibleTask]: {
    qrl: QwikHook.UseVisibleTaskQrl,
    fn: QwikHook.UseVisibleTaskFunction,
  },
  [CoreOperation.Serializer]: {
    qrl: QwikHook.UseSerializerQrl,
    fn: QwikHook.UseSerializerFunction,
  },
};

/**
 * Prop defaults are generated parameters: JavaScript evaluates them left to right in the parameter
 * scope, so a default may read an earlier prop and body locals cannot shadow it.
 */
export function parameterDefaults(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: EmitQrl
): string[] {
  return program.setup.flatMap((entry) => {
    if (entry.s !== SetupKind.PropDefault) {
      return [];
    }
    imports.add(QwikWord.Untrack);
    const prop = valueIrJs(module, entry.read);
    const initializer = expressionJs(module, entry.initializer, emitQrl);
    return [
      `${module.bindings[entry.result].name} = ${QwikWord.Untrack}(() => ${prop} === void 0) ? (${initializer}) : void 0`,
    ];
  });
}

/** Setup declarations shared by CSR and SSR render programs. */
export function emitJsSetup(
  module: LinkedModule,
  program: { setup: LinkedModule['programs'][number]['setup'] },
  imports: Set<string>,
  emitQrl: EmitQrl,
  render?: (program: number, names?: GeneratedNames) => ComponentEmission,
  names?: GeneratedNames,
  target: SetupEmitTarget = {}
): string[] {
  return program.setup.flatMap((entry) => {
    if (entry.s === SetupKind.PropDefault) {
      return [];
    }
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
    if (entry.s === SetupKind.LocalFunction) {
      if (target.localFunction === undefined || entry.use === undefined) {
        throw new UnsupportedError('a local function without a static reference');
      }
      const name = module.bindings[entry.binding].name;
      const reference = target.localFunction(entry.use);
      // Captures are read at call time, so a signal declared below the function still works.
      if (entry.hoisted) {
        return `function ${name}() {\n  return ${reference}.apply(this, arguments);\n}`;
      }
      return `const ${name} = ${entry.use.args.length === 0 ? reference : `(...args) => ${reference}(...args)`};`;
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
      const params = [localNames.props, localNames.ctx, ...(emission.params ?? [])].join(', ');
      return entry.declarationKind === DeclarationKind.Const
        ? `const ${entry.name} = (${params}) => {\n${body}\n};`
        : `function ${entry.name}(${params}) {\n${body}\n}`;
    }
    if (entry.s === SetupKind.PropRest) {
      imports.add(QwikWord.CreatePropsProxy);
      return `const ${module.bindings[entry.result].name} = ${QwikWord.CreatePropsProxy}(${module.bindings[entry.props].name}, ${JSON.stringify(entry.excluded)});`;
    }
    if (entry.s === SetupKind.Call) {
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
      return bindCallResult(module, entry, `${callee}(${args.join(', ')})`);
    }
    if (entry.s === SetupKind.Style) {
      const hook = entry.scoped ? QwikHook.UseStylesScopedFunction : QwikHook.UseStylesFunction;
      imports.add(hook);
      const css =
        typeof entry.css === 'string'
          ? JSON.stringify(entry.css)
          : extractPayloadJs(module, entry.css.dynamic);
      // `true` registers the scope on the invoke context for children rendered later.
      const args = [css, JSON.stringify(entry.styleId), ...(entry.scoped ? ['true'] : [])];
      return bindCallResult(module, entry, `${hook}(${args.join(', ')})`);
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
  /** A lifted body function, bound to its captures, in this module's scope. */
  localFunction?: (use: QrlUse) => string;
  /** Header import lines of the module emitter, for hook twins outside `@qwik.dev/core`. */
  chunkImports?: string[];
}

function bindCallResult(
  module: LinkedModule,
  entry: { result: BindTarget | null; declarationKind?: string },
  call: string
): string {
  if (entry.result === null) {
    return `${call};`;
  }
  if (entry.result.bind !== BindTargetKind.Pattern) {
    throw new UnsupportedError('a call result without a binding pattern');
  }
  return `${entry.declarationKind ?? 'const'} ${extractPayloadJs(module, entry.result.pattern)} = ${call};`;
}

/** A linked fact the emitter must honour unless it is known false. */
export const mayBe = (fact: Maybe<boolean>): boolean => !fact.ok || fact.value;

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
    case CallTargetKind.Marker:
      return markerTwinJs(module, target, form, emitter.chunkImports);
  }
}

function markerTwinJs(
  module: LinkedModule,
  target: Extract<CallTarget, { kind: CallTargetKind.Marker }>,
  form: 'qrl' | 'fn',
  chunkImports: string[] | undefined
): string {
  if (target.twins === undefined) {
    throw new UnsupportedError(`${target.stem}$ without its ${form} twin`);
  }
  return hookTwinJs(module, target.twins[form], chunkImports);
}

/** Lets a payload emitter print custom `$` hook calls: static callbacks take the function twin. */
export function withMarkerEmitter(
  module: LinkedModule,
  emitQrl: EmitQrl,
  chunkImports: string[] | undefined,
  staticQrl?: (use: QrlUse) => string
): EmitQrl {
  return Object.assign(emitQrl, {
    marker: (target: Extract<CallTarget, { kind: CallTargetKind.Marker }>, use: QrlUse) => ({
      callee: markerTwinJs(module, target, staticQrl === undefined ? 'qrl' : 'fn', chunkImports),
      argument: (staticQrl ?? emitQrl)(use),
    }),
  });
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

function argJs(module: LinkedModule, arg: Arg, emitQrl: EmitQrl): string {
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
export interface SourcePass {
  next: (prefix: string) => string;
  /** One hoisted `propSource` per props member and render function, keyed `binding.name`. */
  propSources: Map<string, string>;
  /** Names the server already rooted in this pass. */
  rooted?: Set<string>;
}

/**
 * The source a read value binds to: a signal by name, or a props member hoisted once per render
 * function. The server roots a prop source at the hoist, guarded since a static prop is a value.
 */
export function readSource(
  module: LinkedModule,
  expr: Expr,
  pass: SourcePass,
  statements: string[],
  imports: Set<string>,
  ssrCtx: string | null
): string {
  const ir = expr.kind === ExprKind.Ir ? expr.ir : null;
  if (ir?.kind === ValueIrKind.SignalRead) {
    return module.bindings[ir.binding].name;
  }
  if (ir?.kind !== ValueIrKind.Member || ir.obj.kind !== ValueIrKind.BindingRead) {
    throw new UnsupportedError('a read hole without a source');
  }
  const key = `${ir.obj.binding}.${ir.name}`;
  let name = pass.propSources.get(key);
  if (name === undefined) {
    name = pass.next(QwikGenWord.PropSource);
    pass.propSources.set(key, name);
    imports.add(QwikWord.PropSource);
    statements.push(
      `const ${name} = ${QwikWord.PropSource}(${module.bindings[ir.obj.binding].name}, ${JSON.stringify(ir.name)});`
    );
    if (ssrCtx !== null) {
      imports.add(QwikWord.IsSource);
      statements.push(`${QwikWord.IsSource}(${name}) && ${ssrCtx}.addRoot(${name});`);
      pass.rooted?.add(name);
    }
  }
  return name;
}

/** A custom hook's compiled body: its setup statements and the authored result. */
export function emitHookBody(
  module: LinkedModule,
  hook: HookDecl,
  imports: Set<string>,
  emitQrl: EmitQrl,
  names: GeneratedNames,
  target: SetupEmitTarget
): string {
  const body = hook.body;
  if (body.kind !== HookBodyKind.Setup) {
    throw new Error(`pipeline: emitting the authored hook "${hook.name}"`);
  }
  const statements = emitJsSetup(module, body, imports, emitQrl, undefined, names, target);
  const value =
    body.returns === null
      ? null
      : body.returns.v === ValueKind.Qrl
        ? emitQrl(body.returns.use)
        : inlineValueJs(module, body.returns, emitQrl);
  // An expression body with nothing to set up keeps its authored shape.
  if (hook.bodyKind === FnBodyKind.Expression && statements.length === 0 && value !== null) {
    return value;
  }
  const returns = value === null ? [] : [`return ${value};`];
  return `{\n${[...statements, ...returns].join('\n')}\n}`;
}
