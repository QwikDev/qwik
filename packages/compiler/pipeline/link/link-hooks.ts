import {
  CallTargetKind,
  ExportKind,
  ExportTargetKind,
  HookTwinKind,
  SetupKind,
  type CallTarget,
  type HookTwin,
  type LinkedModule,
  type Setup,
} from '../schema';
import { QRL_TWIN_SUFFIX } from '../words';
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
  module.payloads = module.payloads.map((payload) =>
    payload.setups === undefined
      ? payload
      : {
          ...payload,
          setups: payload.setups.map((nested) => ({ ...nested, setup: linkSetup(nested.setup) })),
        }
  );
}
