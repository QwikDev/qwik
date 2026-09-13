import {
  CallTargetKind,
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

/**
 * Whether a setup registers `useOn*` events, following custom hooks into their linked bodies. A
 * callee the link cannot see leaves the answer unknown, so the emitter keeps the splice slot.
 */
export function setupRegistersEvents(
  plans: readonly ModulePlan[],
  resolveBinding: (module: number, binding: number) => Maybe<DeclRef>
): (module: number, setup: readonly Setup[]) => Maybe<boolean> {
  const isCoreBinding = (module: number, binding: number): boolean =>
    plans[module].imports.some(
      (entry) =>
        entry.binding === binding && plans[module].edges[entry.edge].specifier === QWIK_CORE_IMPORT
    );
  const visiting = new Set<string>();
  const registers = (module: number, setup: readonly Setup[]): Maybe<boolean> => {
    let known = true;
    for (const entry of flatSetup(plans[module], setup)) {
      if (entry.s !== SetupKind.Call) {
        continue;
      }
      if (entry.visibleTaskEvent !== undefined) {
        return { ok: true, value: true };
      }
      const target = entry.target;
      if (target.kind === CallTargetKind.Core) {
        continue;
      }
      if (target.kind === CallTargetKind.Value) {
        known = false;
        continue;
      }
      if (target.kind === CallTargetKind.Binding) {
        const name = plans[module].bindings[target.binding].name;
        if (isCoreBinding(module, target.binding)) {
          if (useOnHooks.includes(name)) {
            return { ok: true, value: true };
          }
          continue;
        }
        // Only hooks by convention may register events; a plain call cannot.
        if (!/^use/.test(name)) {
          continue;
        }
      }
      const declaration = resolveBinding(module, target.binding);
      if (!declaration.ok || declaration.value.table !== DeclTable.Hooks) {
        known = false;
        continue;
      }
      const { module: hookModule, index } = declaration.value;
      const hook = plans[hookModule].hooks[index];
      const key = `${hookModule}:${index}`;
      if (hook.body.kind !== HookBodyKind.Setup || visiting.has(key)) {
        known = false;
        continue;
      }
      visiting.add(key);
      const nested = registers(hookModule, hook.body.setup);
      visiting.delete(key);
      if (nested.ok && nested.value) {
        return nested;
      }
      known &&= nested.ok;
    }
    return known ? { ok: true, value: false } : unknownFact;
  };
  return registers;
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
