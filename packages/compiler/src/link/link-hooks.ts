import {
  CallTargetKind,
  CoreOperation,
  DeclTable,
  ExportKind,
  ExportTargetKind,
  HookBodyKind,
  HookTwinKind,
  SetupKind,
  UnknownWhy,
  type CallTarget,
  type DeclRef,
  type HookTwin,
  type LinkedModule,
  type Maybe,
  type ModulePlan,
  type Setup,
} from '../schema';
import { QRL_TWIN_SUFFIX, QWIK_CORE_IMPORT, QwikWord } from '../words';
import type { LinkDiagnostic } from './link-plans';

type MarkerTarget = Extract<CallTarget, { kind: CallTargetKind.Marker }>;

/**
 * Resolves each custom `$` hook's twins from the hook's own source, adding imports the module
 * lacks.
 */
export function linkHookTwins(module: LinkedModule, diagnostics: LinkDiagnostic[]): void {
  const taken = new Set(module.bindings.map((binding) => binding.name));
  const added = new Map<string, HookTwin>();
  const resolve = (binding: number, twin: string): HookTwin | null => {
    const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
    if (source === undefined) {
      const exported = module.exports.find(
        (entry) => entry.e === ExportKind.Local && entry.exported === twin
      );
      return exported?.e === ExportKind.Local && exported.target.t === ExportTargetKind.Binding
        ? { t: HookTwinKind.Binding, binding: exported.target.binding }
        : null;
    }
    const authored = module.imports.find(
      (entry) =>
        entry.source.edge === source.edge &&
        entry.source.imported === twin &&
        !entry.source.typeOnly
    );
    if (authored !== undefined) {
      return { t: HookTwinKind.Binding, binding: authored.source.binding };
    }
    const key = `${source.edge}:${twin}`;
    let imported = added.get(key);
    if (imported === undefined) {
      let local = twin;
      while (taken.has(local)) {
        local += '_';
      }
      taken.add(local);
      imported = { t: HookTwinKind.Import, edge: source.edge, imported: twin, local };
      added.set(key, imported);
    }
    return imported;
  };
  const linkTarget = ({ binding, stem }: MarkerTarget): MarkerTarget['twins'] => {
    const qrl = resolve(binding, stem + QRL_TWIN_SUFFIX);
    const fn = resolve(binding, stem);
    if (qrl === null || fn === null) {
      diagnostics.push({
        module: module.path,
        code: 'missing-hook-twin',
        message: `"${stem}$" needs "${stem}${QRL_TWIN_SUFFIX}" and "${stem}" exported from the same module.`,
      });
      return undefined;
    }
    return { qrl, fn };
  };
  const linkSetup = (setup: readonly Setup[]): Setup[] =>
    setup.map((entry) => {
      if (entry.s !== SetupKind.Call || entry.target.kind !== CallTargetKind.Marker) {
        return entry;
      }
      const twins = linkTarget(entry.target);
      return twins === undefined ? entry : { ...entry, target: { ...entry.target, twins } };
    });
  module.programs = module.programs.map((program) => ({
    ...program,
    setup: linkSetup(program.setup),
  }));
  module.hooks = module.hooks.map((hook) =>
    hook.body.kind === HookBodyKind.Setup
      ? { ...hook, body: { ...hook.body, setup: linkSetup(hook.body.setup) } }
      : hook
  );
  module.payloads = module.payloads.map((payload) => ({
    ...payload,
    qrls: payload.qrls.map((entry) => {
      const marker = entry.marker;
      const twins = marker === undefined ? undefined : linkTarget(marker.target);
      return marker === undefined || twins === undefined
        ? entry
        : { ...entry, marker: { ...marker, target: { ...marker.target, twins } } };
    }),
    setups: payload.setups?.map((nested) => ({ ...nested, setup: linkSetup(nested.setup) })),
  }));
}

const useOnHooks: readonly string[] = [
  QwikWord.UseOn,
  QwikWord.UseOnDocument,
  QwikWord.UseOnWindow,
];

type SetupCall = Extract<Setup, { s: SetupKind.Call }>;

export interface SetupFacts {
  registersEvents: Maybe<boolean>;
  waitForTasks: Maybe<boolean>;
  providesContextEffective: Maybe<boolean>;
  readsChildrenInfo: Maybe<boolean>;
}

/**
 * Cross-module setup facts: a core call answers directly, a custom hook answers from its linked
 * body, and a callee the link cannot see leaves the fact unknown so the emitter stays safe.
 */
export function createSetupFacts(
  plans: readonly ModulePlan[],
  resolveBinding: (module: number, binding: number) => Maybe<DeclRef>
): (module: number, setup: readonly Setup[]) => SetupFacts {
  const isCoreBinding = (module: number, binding: number): boolean =>
    plans[module].imports.some(
      (entry) =>
        entry.binding === binding && plans[module].edges[entry.edge].specifier === QWIK_CORE_IMPORT
    );
  const fact = (direct: (module: number, call: SetupCall) => boolean) => {
    const visiting = new Set<string>();
    const walk = (module: number, setup: readonly Setup[]): Maybe<boolean> => {
      let known = true;
      for (const entry of flatSetup(plans[module], setup)) {
        if (entry.s !== SetupKind.Call) {
          continue;
        }
        if (direct(module, entry)) {
          return { ok: true, value: true };
        }
        const target = entry.target;
        // Core APIs answered above; lowering flags custom hook calls (a prop alias is not one).
        if (target.kind === CallTargetKind.Core || entry.blocksInitialRender !== true) {
          continue;
        }
        if (target.kind === CallTargetKind.Value) {
          known = false;
          continue;
        }
        const declaration = resolveBinding(module, target.binding);
        if (!declaration.ok) {
          known = false;
          continue;
        }
        const hookModule = declaration.value.module;
        const hooks = plans[hookModule].hooks;
        // A marker's own binding is its `$` wrapper; its body lives in a twin of the same module.
        const index =
          declaration.value.table === DeclTable.Hooks
            ? declaration.value.index
            : target.kind === CallTargetKind.Marker
              ? hooks.findIndex(
                  (hook) => hook.name === target.stem + QRL_TWIN_SUFFIX || hook.name === target.stem
                )
              : -1;
        const hook = hooks[index];
        const key = `${hookModule}:${index}`;
        if (hook === undefined || hook.body.kind !== HookBodyKind.Setup || visiting.has(key)) {
          known = false;
          continue;
        }
        visiting.add(key);
        const nested = walk(hookModule, hook.body.setup);
        visiting.delete(key);
        if (nested.ok && nested.value) {
          return nested;
        }
        known &&= nested.ok;
      }
      return known ? { ok: true, value: false } : unknownFact;
    };
    return walk;
  };
  const registersEvents = fact(
    (module, call) =>
      call.visibleTaskEvent !== undefined ||
      (call.target.kind === CallTargetKind.Binding &&
        isCoreBinding(module, call.target.binding) &&
        useOnHooks.includes(plans[module].bindings[call.target.binding].name))
  );
  const waitForTasks = fact(
    (_module, call) => call.target.kind === CallTargetKind.Core && call.blocksInitialRender === true
  );
  const providesContext = fact((_module, call) => call.providesContext === true);
  const readsChildrenInfo = fact(
    (_module, call) =>
      call.target.kind === CallTargetKind.Core &&
      call.target.operation === CoreOperation.ChildrenInfo
  );
  return (module, setup) => ({
    registersEvents: registersEvents(module, setup),
    waitForTasks: waitForTasks(module, setup),
    providesContextEffective: providesContext(module, setup),
    readsChildrenInfo: readsChildrenInfo(module, setup),
  });
}

const unknownFact: Maybe<boolean> = {
  ok: false,
  reason: { why: UnknownWhy.Opaque, code: 'unlinked-hook-body' },
};

/** Setup entries including those nested in authored statements. */
function flatSetup(plan: ModulePlan, setup: readonly Setup[]): Setup[] {
  return setup.flatMap((entry) => [
    entry,
    ...(entry.s === SetupKind.Js
      ? (plan.payloads[entry.payload].setups ?? []).flatMap((nested) =>
          flatSetup(plan, nested.setup)
        )
      : []),
  ]);
}
