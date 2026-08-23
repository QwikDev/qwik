/**
 * LinkedPlan — materialized linked modules (DESIGN.md "Model" — LinkedPlan).
 *
 * The linker MATERIALIZES linked modules: same table layout as ModulePlan with linked leaves — raw
 * targets become `Maybe<DeclRef>`, guard-carrying entries are folded away or kept, branches with
 * decided constants are folded, ValueIR build-constant leaves are folded. Nothing is
 * overlay-addressed by string keys.
 */
import type {
  LINKED_PLAN_VERSION,
  BuildMode,
  ContextKind,
  Diagnostic,
  Environment,
  Lifetime,
  Maybe,
  ModuleKind,
  ModuleSource,
  PayloadId,
  PlanFormat,
  Range,
} from './shared';
import type { EsmEdge, Payload } from './value';
import type { Program } from './program';
import type {
  AssemblyIntent,
  AssemblyKind,
  ComponentDecl,
  DeclTable,
  HookDecl,
  ModulePlan,
  Qrl,
} from './module-plan';

export interface Specialization {
  environment: Environment;
  mode: BuildMode;
  /**
   * Generic core policy. Context/event stripping and symbol registration are FRAMEWORK policies —
   * supplied through the plugin snapshot by their owners (Router, test tooling).
   */
  stripExports: string[];
}

export interface DeclRef {
  module: number;
  table: DeclTable;
  index: number;
}

export interface LinkedModule {
  path: string;
  kind: ModuleKind;
  source: ModuleSource;
  bindings: ModulePlan['bindings'];
  lifetimes: Lifetime[];
  /** Text materialized; reads/awaits/qrls intact. */
  payloads: Payload[];
  programs: LinkedProgram[];
  qrls: LinkedQrl[];
  /** Targets/refs inside bodies are linked. */
  components: ComponentDecl[];
  hooks: HookDecl[];
  callables: ModulePlan['callables'];
  values: ModulePlan['values'];
  /** `id` is the CANONICAL runtime context id — the lookup key. */
  contexts: { id: string; name: string; kind: Maybe<ContextKind> }[];
  natives: {
    name: string;
    markerRange: Range;
    jsImplementation: PayloadId;
    /** (native, language) → index into `LinkedPlan.implementations`. */
    implementations: Record<string, { impl: number }>;
  }[];
  defs: ModulePlan['defs'];
  edges: (EsmEdge & { target: Maybe<number>; runtime: boolean })[];
  exports: ModulePlan['exports'];
  /** Plus linked edits on preserved spans: constant folds and pruned ranges (dead imports). */
  assembly: (
    | AssemblyIntent
    | { a: AssemblyKind.ConstantFold; range: Range; value: 'true' | 'false' }
    | { a: AssemblyKind.StripRange; range: Range }
  )[];
  /** Guards folded. */
  diagnostics: Diagnostic[];
}

export interface LinkedProgram extends Program {
  /** Cross-module joins land HERE — the owner the raw plan cannot have. */
  facts: {
    needsId: Maybe<boolean>;
    waitForTasks: Maybe<boolean>;
    providesContextEffective: Maybe<boolean>;
    runtimeScope: Maybe<boolean>;
  };
}

export const enum DeliveryKind {
  Chunk = 'chunk',
  Inline = 'inline',
  Reference = 'reference',
  Noop = 'noop',
  Omit = 'omit',
  Stripped = 'stripped',
  Register = 'register',
}

export interface LinkedQrl extends Qrl {
  /** Full delivery states, per environment link; chunk naming decided at link, not in neutral data. */
  delivery:
    | { d: DeliveryKind.Chunk; chunkBase: string; resolved: boolean }
    | { d: DeliveryKind.Inline }
    | { d: DeliveryKind.Reference }
    | { d: DeliveryKind.Noop }
    | { d: DeliveryKind.Omit }
    | { d: DeliveryKind.Stripped }
    | { d: DeliveryKind.Register; symbol: string };
}

export const enum EntryKind {
  Module = 'module',
  Export = 'export',
}

export const enum ImplementationContentKind {
  Files = 'files',
  ExternalPackage = 'external-package',
  Registration = 'registration',
}

export interface LinkedPlan {
  format: PlanFormat.LinkedPlan;
  version: typeof LINKED_PLAN_VERSION;
  specialization: Specialization;
  /**
   * Incomplete = per-module transform link (unreached refs are typed unknowns); artifacts and
   * native generation REQUIRE a complete link.
   */
  complete: boolean;
  entries: (
    | { kind: EntryKind.Module; module: number }
    | { kind: EntryKind.Export; module: number; export: string; target: Maybe<DeclRef> }
  )[];
  modules: LinkedModule[];
  /**
   * ONE provider-qualified implementation table (native sources/packages, plugin emissions,
   * framework registrations). The generator selects what it supports by (provider, key, language);
   * packages carry content or an explicit external-dependency contract, never a bare filesystem
   * path.
   */
  implementations: {
    provider: string;
    key: string;
    language: string | null;
    content:
      | { kind: ImplementationContentKind.Files; files: { path: string; source: string }[] }
      | {
          kind: ImplementationContentKind.ExternalPackage;
          dependency: { name: string; version: string; fingerprint: string };
        }
      | { kind: ImplementationContentKind.Registration; symbol: string };
    dependencies: Record<string, string>;
    /** Signature identity for plugin-call entrypoints. */
    argCount?: number;
    async?: boolean;
  }[];
  diagnostics: { module: number; diagnostic: Diagnostic }[];
}

export const enum LinkResultKind {
  Linked = 'linked',
  Failed = 'failed',
}

export type LinkResult =
  | { kind: LinkResultKind.Linked; plan: LinkedPlan }
  | {
      kind: LinkResultKind.Failed;
      diagnostics: { module: string; code: string; message: string }[];
    };
