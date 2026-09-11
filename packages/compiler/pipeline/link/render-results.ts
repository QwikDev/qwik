import { returnPath, elementPath, numericPath, type ResultPath } from './result-path';
import { createDeclaredResultReader } from './type-results';
import { ValueIrKind as Ir } from '../../src/expr-ir';
import {
  ComponentPropsKind,
  ComponentTargetKind,
  DeclTable,
  EntryKind,
  ExprKind,
  ImportTargetKind,
  OpKind,
  PropKind,
  PropsPartKind,
  QrlBodyKind,
  ProgramBodyKind,
  Shape,
  SetupKind,
  ValueKind,
  type DeclRef,
  type BindingConsumer,
  type BindingResult,
  type LinkedImport,
  type LinkedModule,
  type LinkedOp,
  type LinkedPlan,
  type Maybe,
  type Result,
  type Setup,
  type Value,
} from '../schema';

const enum Kind {
  Text = 1,
  Undefined = 2,
  Empty = 4,
  Render = 8,
  Array = 16,
  Object = 32,
  Unknown = 64,
  Missing = 128,
  String = 256,
  Number = 512,
}
const isNumericKey = (name: string) => name !== '' && String(Number(name)) === name;
const matchesPath = (name: string, part: string | symbol | undefined) =>
  name === part || ((part === numericPath || part === elementPath) && isNumericKey(name));
const scalar = Kind.Text | Kind.String | Kind.Number | Kind.Undefined | Kind.Empty | Kind.Missing;
const stringMethods = new Set([
  'toUpperCase',
  'toLowerCase',
  'trim',
  'trimStart',
  'trimEnd',
  'charAt',
  'slice',
  'substring',
  'repeat',
  'padStart',
  'padEnd',
  'concat',
]);
const unknown: Result = { kind: 'unknown-result' };
const bindingKey = (module: number, binding: number) => `${module}:${binding}`;
const escapesBinding = (result: BindingResult | undefined) =>
  result?.escapes.some((path) => path.length === 0) ||
  result?.consumers?.some((consumer) => consumer.path.length === 0);
type Input = { module: number; result: Result };

/** Solves component inputs before choosing any rendering strategy. */
export function linkRenderResults(
  plan: LinkedPlan,
  reachable: ReadonlySet<string>,
  qrlIndexes: readonly ReadonlyMap<string, number>[],
  importsByBinding: readonly ReadonlyMap<number, LinkedImport>[],
  resolveBinding: (module: number, binding: number) => Maybe<DeclRef>
): void {
  const modules = plan.modules;
  const readDeclaredResult = createDeclaredResultReader(modules);
  const inputs = new Map<string, Input[]>();
  const exposed = new Set<string>();
  const exposedFunctions = new Set<string>();
  const componentProps = new Map<string, number>();
  const componentPrograms = new Map<string, number>();
  const declKey = (decl: DeclRef) => `${decl.module}:${decl.table}:${decl.index}`;
  modules.forEach((module, moduleIndex) => {
    const declarations = [
      ...module.programs.flatMap((program) => program.setup),
      ...module.payloads.flatMap(
        (payload) => payload.setups?.flatMap((replacement) => replacement.setup) ?? []
      ),
    ];
    for (const setup of declarations) {
      if (setup.s !== SetupKind.LocalComponent || setup.binding == null) {
        continue;
      }
      const key = `${moduleIndex}:${DeclTable.Bindings}:${setup.binding}`;
      componentPrograms.set(key, setup.program);
      const binding = setup.parameter?.surface.binding;
      if (binding == null) {
        continue;
      }
      componentProps.set(key, binding);
      inputs.set(bindingKey(moduleIndex, binding), []);
      if (escapesBinding(module.bindings[setup.binding].result)) {
        exposed.add(bindingKey(moduleIndex, binding));
      }
    }
    module.qrls.forEach((qrl, index) => {
      const parameter = qrl.declaration?.parameter;
      if (parameter?.surface.binding == null) {
        return;
      }
      componentProps.set(`${moduleIndex}:${DeclTable.Qrls}:${index}`, parameter.surface.binding);
      inputs.set(bindingKey(moduleIndex, parameter.surface.binding), []);
      const binding = qrl.declaration!.binding;
      if (binding !== null && escapesBinding(module.bindings[binding].result)) {
        exposed.add(bindingKey(moduleIndex, parameter.surface.binding));
      }
    });
  });
  for (const entry of plan.entries) {
    if (entry.kind !== EntryKind.Export || !entry.target.ok) {
      continue;
    }
    if (entry.target.value.table === DeclTable.Bindings) {
      exposedFunctions.add(bindingKey(entry.target.value.module, entry.target.value.index));
    }
    const binding = componentProps.get(declKey(entry.target.value));
    if (binding !== undefined) {
      exposed.add(bindingKey(entry.target.value.module, binding));
    }
  }

  const activePrograms = modules.map(() => new Set<number>());
  const activePayloads = modules.map(() => new Set<number>());
  const visitSetup = (module: number, setup: Setup): void => {
    if (setup.s !== SetupKind.Js || activePayloads[module].has(setup.payload)) {
      return;
    }
    activePayloads[module].add(setup.payload);
    const payload = modules[module].payloads[setup.payload];
    payload.renders.forEach((render) => visitProgram(module, render.program));
    payload.setups?.forEach((replacement) =>
      replacement.setup.forEach((nested) => visitSetup(module, nested))
    );
  };
  const visitProgram = (module: number, program: number): void => {
    if (activePrograms[module].has(program)) {
      return;
    }
    activePrograms[module].add(program);
    modules[module].programs[program].setup.forEach((setup) => visitSetup(module, setup));
    const body = modules[module].programs[program].body;
    if (body.kind === ProgramBodyKind.Ops) {
      body.ops.forEach((op) => visitOp(module, op));
    }
  };
  const visitQrl = (module: number, id: string): void => {
    const index = qrlIndexes[module].get(id);
    if (index === undefined) {
      return;
    }
    const body = modules[module].qrls[index].body;
    if (body.b === QrlBodyKind.Program) {
      visitProgram(module, body.program);
    }
  };
  const visitOp = (module: number, op: LinkedOp): void => {
    switch (op.op) {
      case OpKind.Element:
        op.children.forEach((child) => visitOp(module, child));
        break;
      case OpKind.Component: {
        if (op.target.t === ComponentTargetKind.Declaration && op.target.declaration.ok) {
          const target = op.target.declaration.value;
          const binding = componentProps.get(declKey(target));
          if (binding !== undefined) {
            inputs.get(bindingKey(target.module, binding))!.push({
              module,
              result: propsResult(modules[module], op),
            });
          }
          if (target.table === DeclTable.Qrls) {
            visitQrl(target.module, modules[target.module].qrls[target.index].id);
          }
          const localProgram = componentPrograms.get(declKey(target));
          if (localProgram !== undefined) {
            visitProgram(target.module, localProgram);
          }
        }
        for (const projection of op.projections) {
          const use = projection.kind === 'render' ? projection.use : projection.fallback;
          if (use !== null) {
            visitQrl(module, use.qrl);
          }
        }
        break;
      }
      case OpKind.Branch:
        visitQrl(module, op.then.qrl);
        if (op.else !== null) {
          visitQrl(module, op.else.qrl);
        }
        break;
      case OpKind.Each:
        if (op.row.r === 'inline') {
          visitProgram(module, op.row.program);
        } else {
          visitQrl(module, op.row.use.qrl);
        }
        break;
      case OpKind.Content:
        visitQrl(module, op.render.qrl);
        break;
      case OpKind.Slot:
        if (op.fallback !== null) {
          visitQrl(module, op.fallback.qrl);
        }
        break;
      case OpKind.Suspense:
        visitProgram(module, op.content);
        break;
    }
  };
  modules.forEach((module, moduleIndex) =>
    module.qrls.forEach((qrl, index) => {
      if (reachable.has(`${moduleIndex}:${DeclTable.Qrls}:${index}`)) {
        visitQrl(moduleIndex, qrl.id);
      }
    })
  );

  const functions = new Map<string, Extract<Result, { kind: 'function-result' }>[]>();
  const collectFunctions = (value: Result): Extract<Result, { kind: 'function-result' }>[] =>
    value.kind === 'function-result'
      ? [value]
      : value.kind === 'union-result'
        ? value.values.flatMap(collectFunctions)
        : [];
  modules.forEach((module, index) =>
    module.bindings.forEach((binding) => {
      if (binding.result === undefined) {
        return;
      }
      const declarations = collectFunctions(binding.result.value);
      functions.set(bindingKey(index, binding.id), declarations);
      for (const fn of declarations) {
        for (const parameter of fn.params) {
          if (parameter !== null && !inputs.has(bindingKey(index, parameter))) {
            inputs.set(bindingKey(index, parameter), []);
            if (
              exposedFunctions.has(bindingKey(index, binding.id)) ||
              escapesBinding(binding.result)
            ) {
              exposed.add(bindingKey(index, parameter));
            }
          }
        }
      }
    })
  );
  modules.forEach((module, moduleIndex) => {
    for (const invocation of module.invocations ?? []) {
      let targetModule = moduleIndex;
      let declarations: Extract<Result, { kind: 'function-result' }>[] = [];
      if (invocation.callee.kind === 'function-result') {
        declarations = [invocation.callee];
      } else if (invocation.callee.kind === Ir.BindingRead) {
        const resolved = resolveBinding(moduleIndex, invocation.callee.binding);
        if (!resolved.ok) {
          continue;
        }
        const target = resolved.value;
        targetModule = target.module;
        const binding =
          target.table === DeclTable.Bindings
            ? target.index
            : target.table === DeclTable.Qrls
              ? modules[targetModule].qrls[target.index].declaration?.binding
              : (modules[targetModule][target.table][target.index] as { binding?: number }).binding;
        if (binding !== undefined && binding !== null) {
          declarations = functions.get(bindingKey(targetModule, binding)) ?? [];
        }
      }
      const spreadIndex = invocation.args.findIndex(
        (argument) => argument.kind === 'spread-argument-result'
      );
      for (const fn of declarations) {
        fn.params.forEach((parameter, index) => {
          if (parameter === null) {
            return;
          }
          const key = bindingKey(targetModule, parameter);
          const incoming = inputs.get(key) ?? [];
          incoming.push({
            module: moduleIndex,
            result:
              spreadIndex !== -1 && index >= spreadIndex
                ? unknown
                : (invocation.args[index] ?? { kind: Ir.Undef }),
          });
          inputs.set(key, incoming);
        });
      }
    }
  });

  /** Kinds a mutation may write into `path`; 0 when the path provably stays untouched. */
  const mutationKinds = (
    module: number,
    binding: number,
    path: ResultPath,
    seen: Set<string>
  ): number => {
    const key = bindingKey(module, binding);
    const facts = modules[module].bindings[binding]?.result;
    if (seen.has(key) || facts === undefined) {
      return Kind.Unknown;
    }
    if (
      facts.escapes.some(
        (escape) =>
          escape.length < path.length &&
          escape.every((part, index) => matchesPath(part, path[index]))
      )
    ) {
      return Kind.Unknown;
    }
    const next = new Set(seen).add(key);
    let kinds = 0;
    for (const write of facts.writes) {
      if (write.path.every((part, index) => matchesPath(part, path[index]))) {
        kinds |= evaluate(module, write.value, path.slice(write.path.length));
      }
    }
    for (const consumer of facts.consumers ?? []) {
      if (
        consumer.path.length < path.length &&
        consumer.path.every((part, index) => matchesPath(part, path[index]))
      ) {
        kinds |= consumerMutationKinds(module, consumer, path.slice(consumer.path.length), next);
      }
    }
    return kinds;
  };
  const consumerMutationKinds = (
    module: number,
    consumer: BindingConsumer,
    path: ResultPath,
    seen: Set<string>
  ): number => {
    if (consumer.target.kind === 'function-result' && consumer.property === undefined) {
      const parameter = consumer.target.params[consumer.argument];
      return parameter == null ? Kind.Unknown : mutationKinds(module, parameter, path, seen);
    }
    if (consumer.target.kind !== Ir.BindingRead) {
      return Kind.Unknown;
    }
    const resolved = resolveBinding(module, consumer.target.binding);
    if (!resolved.ok) {
      return Kind.Unknown;
    }
    const target = resolved.value;
    if (consumer.property !== undefined) {
      const parameter = componentProps.get(declKey(target));
      return parameter === undefined
        ? Kind.Unknown
        : mutationKinds(target.module, parameter, [consumer.property, ...path], seen);
    }
    const binding =
      target.table === DeclTable.Bindings
        ? target.index
        : target.table === DeclTable.Qrls
          ? modules[target.module].qrls[target.index].declaration?.binding
          : null;
    const declarations =
      binding == null ? [] : (functions.get(bindingKey(target.module, binding)) ?? []);
    if (declarations.length === 0) {
      return Kind.Unknown;
    }
    let kinds = 0;
    for (const fn of declarations) {
      const parameter = fn.params[consumer.argument];
      kinds |=
        parameter == null ? Kind.Unknown : mutationKinds(target.module, parameter, path, seen);
    }
    return kinds;
  };

  const cache = new Map<string, number>();
  const evaluating = new Set<string>();
  const activePaths = new Map<string, ResultPath[]>();
  let changed = false;
  let finalize = false;
  const readBinding = (moduleIndex: number, binding: number, path: ResultPath): number => {
    const key = `${moduleIndex}:${binding}:${JSON.stringify(path.map((part) => (typeof part === 'symbol' ? { result: part.description } : part)))}`;
    if (evaluating.has(key)) {
      return cache.get(key) ?? 0;
    }
    const inputKey = bindingKey(moduleIndex, binding);
    const paths = activePaths.get(inputKey) ?? [];
    if (
      paths.some(
        (previous) =>
          path.length > previous.length &&
          (previous.every((part, index) => part === path[index]) ||
            previous.every((part, index) => part === path[path.length - previous.length + index]))
      )
    ) {
      return Kind.Unknown;
    }
    paths.push(path);
    activePaths.set(inputKey, paths);
    evaluating.add(key);
    const module = modules[moduleIndex];
    const imported = importsByBinding[moduleIndex].get(binding);
    const incoming = inputs.get(inputKey);
    const facts = module.bindings[binding]?.result;
    let result = 0;
    if (incoming !== undefined) {
      if (exposed.has(inputKey) || incoming.length === 0) {
        result = Kind.Unknown;
      } else {
        for (const input of incoming) {
          result |= evaluate(input.module, input.result, path);
        }
      }
    } else if (imported?.kind === ImportTargetKind.Declaration && imported.target.ok) {
      const target = imported.target.value;
      const declaration = modules[target.module][target.table][target.index];
      const targetBinding =
        target.table === DeclTable.Bindings
          ? target.index
          : target.table === DeclTable.Qrls
            ? modules[target.module].qrls[target.index].declaration?.binding
            : (declaration as { binding?: number | null }).binding;
      result =
        targetBinding == null ? Kind.Unknown : readBinding(target.module, targetBinding, path);
    } else {
      if (facts === undefined) {
        result = Kind.Unknown;
      } else {
        result = evaluate(moduleIndex, facts.value, path);
      }
    }
    if (facts !== undefined) {
      for (const write of facts.writes) {
        if (write.path.every((part, index) => matchesPath(part, path[index]))) {
          result |= evaluate(moduleIndex, write.value, path.slice(write.path.length));
        }
      }
      for (const escape of facts.escapes) {
        if (
          escape.length >= path.length ||
          !escape.every((part, index) => matchesPath(part, path[index]))
        ) {
          continue;
        }
        const receiver = readBinding(moduleIndex, binding, escape);
        if (receiver !== 0 && (receiver & ~scalar) === 0) {
          continue;
        }
        if (
          receiver === Kind.Array &&
          path.length === escape.length + 1 &&
          path.at(-1) === 'length'
        ) {
          continue;
        }
        if (receiver !== 0 || finalize) {
          result |= Kind.Unknown;
        }
      }
      for (const consumer of facts.consumers ?? []) {
        if (
          consumer.path.length >= path.length ||
          !consumer.path.every((part, index) => matchesPath(part, path[index]))
        ) {
          continue;
        }
        const receiver = readBinding(moduleIndex, binding, consumer.path);
        if (receiver !== 0 && (receiver & ~scalar) === 0) {
          continue;
        }
        if (
          receiver === Kind.Array &&
          path.length === consumer.path.length + 1 &&
          path.at(-1) === 'length'
        ) {
          continue;
        }
        result |= consumerMutationKinds(
          moduleIndex,
          consumer,
          path.slice(consumer.path.length),
          new Set()
        );
      }
    }
    evaluating.delete(key);
    paths.pop();
    if (paths.length === 0) {
      activePaths.delete(inputKey);
    }
    result |= cache.get(key) ?? 0;
    if (finalize && result === 0) {
      result = Kind.Unknown;
    }
    if ((result & Kind.Unknown) !== 0) {
      result =
        (result & ~Kind.Unknown) |
        evaluate(moduleIndex, readDeclaredResult(moduleIndex, binding, path));
    }
    if (cache.get(key) !== result) {
      cache.set(key, result);
      changed = true;
    }
    return result;
  };

  const evaluate = (module: number, result: Result, path: ResultPath = []): number => {
    switch (result.kind) {
      case 'unknown-result':
        return Kind.Unknown;
      case 'render-result':
        return path.length === 0 ? Kind.Render : Kind.Unknown;
      case 'scalar-result':
        return path.length === 0 ? Kind.Text : Kind.Unknown;
      case 'number-result':
        return path.length === 0 ? Kind.Number : Kind.Unknown;
      case 'string-result':
        return path.length === 0
          ? Kind.String
          : path.length === 1 && path[0] === 'length'
            ? Kind.Number
            : Kind.Unknown;
      case 'initializer-result': {
        const kinds = evaluate(module, result.value, path);
        return evaluate(module, result.value) & Kind.Render
          ? (kinds & ~Kind.Render) | evaluate(module, result.value, [returnPath, ...path])
          : kinds;
      }
      case 'element-result':
        return evaluate(module, result.source, [elementPath, ...path]);
      case 'array-rest-result': {
        if (path.length === 0) {
          return Kind.Array;
        }
        if (path[0] === 'length') {
          return Kind.Text;
        }
        if (typeof path[0] === 'string' && /^(0|[1-9]\d*)$/.test(path[0])) {
          return evaluate(module, result.source, [
            String(Number(path[0]) + result.start),
            ...path.slice(1),
          ]);
        }
        return evaluate(module, result.source, path);
      }
      case 'union-result':
        return result.values.reduce((kinds, value) => kinds | evaluate(module, value, path), 0);
      case Ir.BindingRead:
        return readBinding(module, result.binding, path);
      case Ir.SignalRead:
        return readBinding(module, result.binding, ['value', ...path]);
      case Ir.Member:
        return evaluate(module, result.obj, [result.name, ...path]);
      case Ir.Index:
        return result.key.kind === Ir.Lit
          ? evaluate(module, result.obj, [String(result.key.value), ...path])
          : evaluate(module, result.key) === Kind.Number
            ? evaluate(module, result.obj, [numericPath, ...path])
            : Kind.Unknown;
      case Ir.PropRead:
        return evaluate(
          module,
          {
            kind: 'default-result',
            value: {
              kind: Ir.Member,
              obj: { kind: Ir.BindingRead, binding: result.binding },
              name: result.name,
            },
            fallback: result.fallback,
          },
          path
        );
      case 'default-result': {
        const initial = evaluate(module, result.value);
        const fallback =
          initial & (Kind.Undefined | Kind.Missing) ? evaluate(module, result.fallback, path) : 0;
        return (
          (path.length === 0
            ? initial & ~(Kind.Undefined | Kind.Missing)
            : evaluate(module, result.value, path)) | fallback
        );
      }
      case Ir.Logic:
        return evaluate(module, result.left, path) | evaluate(module, result.right, path);
      case Ir.Cond:
        return evaluate(module, result.then, path) | evaluate(module, result.else, path);
      case Ir.Lit:
        if (path.length > 0) {
          return typeof result.value === 'string' && path[0] === 'length'
            ? Kind.Text
            : Kind.Missing;
        }
        return result.value === null || typeof result.value === 'boolean'
          ? Kind.Empty
          : typeof result.value === 'string'
            ? Kind.String
            : Kind.Number;
      case Ir.Undef:
        return path.length === 0 ? Kind.Undefined : Kind.Missing;
      case Ir.Template:
      case Ir.Bin:
      case Ir.Unary:
        return path.length === 0 ? Kind.Text : Kind.Missing;
      case Ir.Array: {
        if (path.length === 0) {
          return Kind.Array;
        }
        if (path[0] === elementPath || path[0] === numericPath) {
          return result.items.reduce(
            (kinds, item) => kinds | evaluate(module, item, path.slice(1)),
            Kind.Missing
          );
        }
        if (path[0] === 'length') {
          return Kind.Text;
        }
        const value = typeof path[0] === 'string' ? result.items[Number(path[0])] : undefined;
        return value === undefined ? Kind.Missing : evaluate(module, value, path.slice(1));
      }
      case Ir.Object:
        return evaluate(
          module,
          {
            kind: 'spread-result',
            parts: result.entries.map(([name, value]) => ({ name, value })),
          },
          path
        );
      case 'spread-result': {
        if (path.length === 0) {
          return Kind.Object;
        }
        if (path[0] === numericPath) {
          return result.parts.reduce(
            (kinds, part) =>
              kinds |
              (part.name === null
                ? evaluate(module, part.value, path)
                : isNumericKey(part.name)
                  ? evaluate(module, part.value, path.slice(1))
                  : 0),
            Kind.Missing
          );
        }
        let kinds = Kind.Missing;
        for (const part of result.parts) {
          if (part.name === path[0]) {
            kinds = evaluate(module, part.value, path.slice(1));
          } else if (part.name === null) {
            const spread = evaluate(module, part.value, path);
            kinds =
              spread & (Kind.Missing | Kind.Unknown) ? kinds | (spread & ~Kind.Missing) : spread;
          }
        }
        return kinds;
      }
      case 'rest-result':
        return typeof path[0] === 'string' && result.excluded.includes(path[0])
          ? Kind.Missing
          : evaluate(module, result.source, path) |
              (path.length > 0 && result.hasComputedExclusions ? Kind.Missing : 0);
      case 'function-result':
        return path[0] === returnPath
          ? evaluate(module, result.result, path.slice(1))
          : Kind.Render;
      case 'invoke-result':
        if (
          result.callee.kind === Ir.Member &&
          stringMethods.has(result.callee.name) &&
          evaluate(module, result.callee.obj) === Kind.String
        ) {
          return path.length === 0
            ? Kind.String
            : path[0] === 'length'
              ? Kind.Number
              : Kind.Unknown;
        }
        return evaluate(module, result.callee, [returnPath, ...path]);
      default:
        return Kind.Unknown;
    }
  };

  const classify = (module: number, op: LinkedOp): LinkedOp => {
    if (op.op === OpKind.Element) {
      return { ...op, children: op.children.map((child) => classify(module, child)) };
    }
    if (op.op !== OpKind.Hole) {
      return op;
    }
    const kinds = op.stringify
      ? Kind.Text
      : evaluate(module, valueResult(modules[module], op.value));
    const shape =
      kinds !== 0 && (kinds & ~scalar) === 0
        ? Shape.Text
        : kinds === Kind.Render
          ? Shape.Element
          : kinds === Kind.Array
            ? Shape.Many
            : Shape.Unknown;
    return { ...op, shape };
  };
  do {
    changed = false;
    modules.forEach((module, index) =>
      module.programs.forEach((program) => {
        if (program.body.kind === ProgramBodyKind.Ops) {
          program.body.ops.forEach((op) => classify(index, op));
        }
      })
    );
    if (!changed && !finalize) {
      finalize = true;
      changed = true;
    }
  } while (changed);
  modules.forEach((module, index) => {
    module.programs = module.programs.map((program) =>
      program.body.kind === ProgramBodyKind.Ops
        ? {
            ...program,
            body: {
              kind: ProgramBodyKind.Ops,
              ops: program.body.ops.map((op) => classify(index, op)),
            },
          }
        : program
    );
  });
}

function valueResult(module: LinkedModule, value: Value): Result {
  if (value.result !== undefined) {
    return value.result;
  }
  switch (value.v) {
    case ValueKind.Static:
      return value.value === undefined ? { kind: Ir.Undef } : { kind: Ir.Lit, value: value.value };
    case ValueKind.Render:
    case ValueKind.Qrl:
      return { kind: 'render-result' };
    case ValueKind.Computed:
    case ValueKind.Read:
      return value.expr.kind === ExprKind.Js
        ? (module.payloads[value.expr.payload].result ?? unknown)
        : (value.expr.ir as Result);
  }
}

function propsResult(
  module: LinkedModule,
  op: Extract<LinkedOp, { op: OpKind.Component }>
): Result {
  if (op.props.c === ComponentPropsKind.Proxy) {
    const id = op.props.compute.qrl;
    const qrl = module.qrls.find((qrl) => qrl.id === id)!;
    return {
      kind: 'spread-result',
      parts: qrl.propsParts.map((part) => {
        switch (part.kind) {
          case PropsPartKind.Spread:
            return { name: null, value: module.payloads[part.value].result ?? unknown };
          case PropsPartKind.Expression:
            return { name: part.name, value: module.payloads[part.value].result ?? unknown };
          case PropsPartKind.Static:
            return {
              name: part.name,
              value:
                part.value === undefined ? { kind: Ir.Undef } : { kind: Ir.Lit, value: part.value },
            };
          case PropsPartKind.Event:
            return { name: part.name, value: { kind: 'render-result' } };
        }
      }),
    };
  }
  return {
    kind: 'spread-result',
    parts: op.props.props.map((prop) => {
      switch (prop.k) {
        case PropKind.Static:
          return {
            name: prop.name,
            value:
              prop.value === undefined ? { kind: Ir.Undef } : { kind: Ir.Lit, value: prop.value },
          };
        case PropKind.Dynamic:
          return { name: prop.name, value: valueResult(module, prop.value) };
        case PropKind.Spread:
          return { name: null, value: valueResult(module, prop.value) };
        default:
          return {
            name: prop.k === PropKind.Event || prop.k === PropKind.Bind ? prop.name : '',
            value: unknown,
          };
      }
    }),
  };
}
