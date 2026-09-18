/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  ComponentTargetKind,
  DeclTable,
  DeliveryKind,
  ImportTargetKind,
  OpKind,
  ProgramBodyKind,
  UnknownWhy,
  type DeclRef,
  type LinkedImport,
  type LinkedModule,
  type LinkedOp,
  type LinkedProgram,
  type Maybe,
  type ModulePlan,
  type Op,
  QrlBodyKind,
} from '../schema';
import { collectHookDependencies, collectQrlDependencies } from './qrl-dependencies';
import { localComponentSetups } from './render-results';
import { createSetupFacts } from './link-hooks';
import { type Resolution, unknown } from './resolve';

/** Ops gain resolved declarations and programs their linked facts, one materialized module each. */
export function materializeModules(
  plans: readonly ModulePlan[],
  resolution: Resolution
): LinkedModule[] {
  const { linkedEdges, linkedImports, importsByBinding, resolveLocalBinding } = resolution;
  const localComponents = plans.map(
    (plan) => new Set(localComponentSetups(plan).map((setup) => setup.binding))
  );
  const linkOperation = (module: number, op: Op): LinkedOp => {
    if (op.op === OpKind.Element) {
      return { ...op, children: op.children.map((child) => linkOperation(module, child)) };
    }
    if (op.op !== OpKind.Component) {
      return op;
    }
    const target = op.target;
    if (target.t === ComponentTargetKind.Dynamic) {
      return { ...op, target };
    }
    const imported = importsByBinding[module].get(target.binding);
    const declaration: Maybe<DeclRef> =
      imported === undefined
        ? resolveLocalBinding(module, target.binding)
        : imported.kind === ImportTargetKind.Declaration
          ? imported.target
          : unknown<DeclRef>(UnknownWhy.Opaque, 'non-portable-export');
    return {
      ...op,
      target: {
        t: ComponentTargetKind.Declaration,
        binding: target.binding,
        declaration,
        ...(target.namespace === undefined ? {} : { namespace: target.namespace }),
        isValue:
          declaration.ok &&
          declaration.value.table === DeclTable.Bindings &&
          !localComponents[declaration.value.module].has(declaration.value.index),
        readsChildren: componentReadsChildren(declaration),
      },
    };
  };
  const setupFacts = createSetupFacts(plans, resolveLocalBinding);
  /** Known only for a linked component; a plain value or an opaque import stays unknown. */
  const componentReadsChildren = (declaration: Maybe<DeclRef>): Maybe<boolean> => {
    if (!declaration.ok || declaration.value.table !== DeclTable.Qrls) {
      return unknown<boolean>(UnknownWhy.Opaque, 'children-reads');
    }
    const owner = plans[declaration.value.module];
    const body = owner.qrls[declaration.value.index].body;
    return body.b === QrlBodyKind.Program
      ? setupFacts(declaration.value.module, owner.programs[body.program].setup).readsChildrenInfo
      : { ok: true, value: false };
  };

  const linkedModules: LinkedModule[] = plans.map((plan, module) =>
    materializeModule(
      plan,
      linkedEdges[module],
      linkedImports[module],
      plan.programs.map(
        (program): LinkedProgram => ({
          ...program,
          body:
            program.body.kind === ProgramBodyKind.Ops
              ? {
                  kind: ProgramBodyKind.Ops,
                  ops: program.body.ops.map((op) => linkOperation(module, op)),
                }
              : program.body,
          facts: {
            needsId: { ok: true, value: program.needsId },
            ...setupFacts(module, program.setup),
            runtimeScope: { ok: true, value: false },
          },
        })
      )
    )
  );

  return linkedModules;
}

function materializeModule(
  plan: ModulePlan,
  edges: LinkedModule['edges'],
  imports: LinkedImport[],
  programs: LinkedProgram[]
): LinkedModule {
  return {
    path: plan.path,
    kind: plan.kind,
    source: plan.source,
    bindings: plan.bindings,
    invocations: plan.invocations,
    lifetimes: plan.lifetimes,
    payloads: plan.payloads,
    programs,
    qrls: plan.qrls.map((qrl) => ({
      ...qrl,
      dependencies: collectQrlDependencies(plan, qrl),
      delivery: { d: DeliveryKind.Chunk, chunkBase: `${plan.path}_${qrl.name}`, resolved: true },
    })),
    hooks: plan.hooks.map((hook) => ({
      ...hook,
      dependencies: collectHookDependencies(plan, hook),
    })),
    callables: plan.callables,
    values: plan.values,
    contexts: [],
    natives: [],
    defs: plan.defs,
    edges,
    imports,
    exports: plan.exports,
    assembly: plan.assembly,
    diagnostics: plan.diagnostics,
  };
}
