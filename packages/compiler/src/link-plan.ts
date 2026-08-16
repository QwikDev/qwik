import type { PlanImportMeta, PlanSegmentMeta, QwikModulePlan } from './emit-plan';
import type { PluginFnPlan } from './expr-lower';
import type { PlanSsrComponent, PlanSsrOp, PlanSsrRenderFn } from './emit-plan-ssr';
import { SsrOpKind } from './emit-plan-ssr';
import { SetupOpKind } from './setup-ir';

/**
 * Links per-module plans into one entry-rooted `qwik/ssr-plan` (specs/01). Version 0 mirrors the
 * module-plan instability: reads stay binding-keyed and `src` fallbacks survive. Component targets
 * resolve by binding id or name within their module, then through the module's import table into
 * sibling module plans; anything unresolved is kept verbatim and listed in `unresolved` so callers
 * (and the native-readiness report) see it. Segment ids stay module-scoped — each linked component
 * carries the `modules` index its segment references resolve in.
 */
export interface QwikSsrPlan {
  readonly format: 'qwik/ssr-plan';
  readonly version: 1;
  readonly entry: number;
  readonly components: readonly LinkedComponent[];
  readonly modules: readonly LinkedModule[];
  readonly unresolved: readonly (number | string)[];
  /** Plugin-claimed fns merged across modules (specs/09), deduped by fnId. */
  readonly pluginFns: readonly PluginFnPlan[];
}

export interface LinkedModule {
  readonly path: string;
  readonly segments: readonly PlanSegmentMeta[];
  readonly contexts: readonly {
    readonly binding: number;
    readonly name: string;
    readonly declaredName?: string;
  }[];
  readonly defs: QwikModulePlan['defs'];
  readonly imports: QwikModulePlan['imports'];
}

export interface LinkedComponent {
  readonly name: string;
  /** Index into `modules`; segment ids in this component's ops resolve there. */
  readonly module: number;
  readonly propsBindings: readonly number[];
  readonly props: QwikModulePlan['components'][number]['props'];
  readonly ssr: QwikModulePlan['components'][number]['ssr'];
  readonly setup: QwikModulePlan['components'][number]['setup'];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly providesContext: boolean;
  /** Linker-computed: some reachable hook has the scoped-styles capability. */
  readonly runtimeStyleScope: boolean;
  readonly async?: true;
}

export function linkSsrPlan(
  modulePlans: readonly QwikModulePlan[],
  entryName: string,
  entryPath?: string
): QwikSsrPlan | null {
  const componentOffsets: number[] = [];
  let componentCount = 0;
  for (const plan of modulePlans) {
    componentOffsets.push(componentCount);
    componentCount += plan.components.length;
  }
  const moduleIndexByPath = new Map(modulePlans.map((plan, index) => [plan.path, index] as const));

  const resolveModuleSpecifier = (importerPath: string, specifier: string): number | null => {
    const stack = importerPath.split('/').slice(0, -1);
    for (const part of specifier.split('/')) {
      if (part === '.' || part === '') {
        continue;
      }
      if (part === '..') {
        stack.pop();
      } else {
        stack.push(part);
      }
    }
    const base = stack.join('/');
    for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`]) {
      const found = moduleIndexByPath.get(candidate);
      if (found !== undefined) {
        return found;
      }
    }
    return null;
  };

  const resolveImportedComponent = (
    importerPath: string,
    importMeta: PlanImportMeta
  ): number | null => {
    const moduleIndex = resolveModuleSpecifier(importerPath, importMeta.module);
    if (moduleIndex === null) {
      return null;
    }
    const local = modulePlans[moduleIndex].components.findIndex(
      (component) => component.name === importMeta.export
    );
    return local < 0 ? null : componentOffsets[moduleIndex] + local;
  };

  const entryModule = entryPath === undefined ? 0 : (moduleIndexByPath.get(entryPath) ?? -1);
  if (entryModule < 0) {
    return null;
  }
  const entryLocal = modulePlans[entryModule]?.components.findIndex(
    (component) => component.name === entryName
  );
  if (entryLocal === undefined || entryLocal < 0) {
    return null;
  }

  const unresolved: (number | string)[] = [];
  const components: LinkedComponent[] = [];

  // hook capability closure: fixpoint over the cross-module hook call graph. Hooks from
  // uncompiled packages are unknown — conservative: assume every capability.
  const ALL_HOOK_CAPABILITIES = ['scoped-styles', 'context-provider'] as const;
  const hookTable = new Map<
    string,
    {
      readonly capabilities: Set<string>;
      readonly calls: readonly { readonly module: string | null; readonly name: string }[];
      readonly moduleIndex: number;
    }
  >();
  modulePlans.forEach((modulePlan, moduleIndex) => {
    for (const hook of modulePlan.hooks ?? []) {
      hookTable.set(`${moduleIndex}#${hook.name}`, {
        capabilities: new Set(hook.capabilities),
        calls: hook.calls,
        moduleIndex,
      });
    }
  });
  const resolveHookKey = (
    fromModule: number,
    call: { readonly module: string | null; readonly name: string }
  ): string | null => {
    const target =
      call.module === null
        ? fromModule
        : resolveModuleSpecifier(modulePlans[fromModule].path, call.module);
    if (target === null) {
      return null;
    }
    const key = `${target}#${call.name}`;
    return hookTable.has(key) ? key : null;
  };
  let hookClosureChanged = true;
  while (hookClosureChanged) {
    hookClosureChanged = false;
    for (const hook of hookTable.values()) {
      for (const call of hook.calls) {
        const targetKey = resolveHookKey(hook.moduleIndex, call);
        const gained =
          targetKey === null ? ALL_HOOK_CAPABILITIES : hookTable.get(targetKey)!.capabilities;
        for (const capability of gained) {
          if (!hook.capabilities.has(capability)) {
            hook.capabilities.add(capability);
            hookClosureChanged = true;
          }
        }
      }
    }
  }
  const componentHookCapabilities = (
    moduleIndex: number,
    hookCalls: readonly { readonly module: string | null; readonly name: string }[] | undefined
  ): ReadonlySet<string> => {
    const capabilities = new Set<string>();
    for (const call of hookCalls ?? []) {
      const key = resolveHookKey(moduleIndex, call);
      const gained = key === null ? ALL_HOOK_CAPABILITIES : hookTable.get(key)!.capabilities;
      for (const capability of gained) {
        capabilities.add(capability);
      }
    }
    return capabilities;
  };

  modulePlans.forEach((modulePlan, moduleIndex) => {
    const offset = componentOffsets[moduleIndex];
    const componentIndexByName = new Map(
      modulePlan.components.map((component, index) => [component.name, offset + index] as const)
    );
    const importByName = new Map(modulePlan.imports.map((entry) => [entry.name, entry]));

    const resolveNameTarget = (name: string): number | null => {
      const local = componentIndexByName.get(name);
      if (local !== undefined) {
        return local;
      }
      const importMeta = importByName.get(name);
      return importMeta === undefined
        ? null
        : resolveImportedComponent(modulePlan.path, importMeta);
    };

    // module-flat identities for the informational semantic tree; SSR ops link scope-accurately
    const moduleLocalComponents = new Set<number | string>();
    const collectLocalComponents = (setup: QwikModulePlan['components'][number]['setup']): void => {
      for (const entry of setup) {
        if (entry.kind === SetupOpKind.RenderFn && entry.component === true) {
          moduleLocalComponents.add(entry.binding!);
          moduleLocalComponents.add(entry.name);
          collectLocalComponents(entry.render.setup);
        }
      }
    };
    for (const component of modulePlan.components) {
      if (component.ssr !== null) {
        collectLocalComponents(component.ssr.setup);
      }
    }

    const linkSsrOps = (ops: readonly PlanSsrOp[]): PlanSsrOp[] => ops.map(linkSsrOp);
    // lexical scopes of local-component names; string targets resolve here before modules/imports
    const localComponentScopes: string[][] = [];
    const isLocalComponentName = (name: string): boolean =>
      localComponentScopes.some((scope) => scope.includes(name));
    const linkSetup = (
      setup: QwikModulePlan['components'][number]['setup']
    ): QwikModulePlan['components'][number]['setup'] => {
      // declarations hoist: every sibling is visible before any nested block links
      localComponentScopes.push(
        setup.flatMap((entry) =>
          entry.kind === SetupOpKind.RenderFn && entry.component === true ? [entry.name] : []
        )
      );
      return setup.map((entry) =>
        entry.kind === SetupOpKind.RenderFn && entry.component === true
          ? { ...entry, render: linkSsrFn(entry.render) }
          : entry
      );
    };
    const linkSsrFn = (fn: PlanSsrRenderFn): PlanSsrRenderFn => {
      const setup = linkSetup(fn.setup);
      const linked = { ...fn, setup, ...(fn.ops === undefined ? {} : { ops: linkSsrOps(fn.ops) }) };
      localComponentScopes.pop();
      return linked;
    };
    const linkSsrOp = (op: PlanSsrOp): PlanSsrOp => {
      switch (op.kind) {
        case SsrOpKind.Element:
          return { ...op, children: linkSsrOps(op.children) };
        case SsrOpKind.Component: {
          const target = op.target;
          if (typeof target !== 'string') {
            return op; // already linked
          }
          if (op.tagBinding !== undefined || isLocalComponentName(target)) {
            // lexical reference — engines resolve through the local-component scope chain
            return {
              ...op,
              slots: op.slots.map((slot) => ({ ...slot, render: linkSsrFn(slot.render) })),
            };
          }
          const resolved = resolveNameTarget(target);
          if (resolved === null) {
            unresolved.push(target);
            return {
              ...op,
              slots: op.slots.map((slot) => ({ ...slot, render: linkSsrFn(slot.render) })),
            };
          }
          return {
            ...op,
            target: { ref: resolved },
            slots: op.slots.map((slot) => ({ ...slot, render: linkSsrFn(slot.render) })),
          };
        }
        case SsrOpKind.Branch:
          return {
            ...op,
            then: linkSsrFn(op.then),
            else: op.else === null ? null : linkSsrFn(op.else),
          };
        case SsrOpKind.Suspense:
          return {
            ...op,
            content: linkSsrFn(op.content),
            fallback: op.fallback === null ? null : linkSsrFn(op.fallback),
            inOrder: op.inOrder === null ? null : linkSsrOps(op.inOrder),
          };
        case SsrOpKind.Slot:
          return { ...op, fallback: op.fallback === null ? null : linkSsrFn(op.fallback) };
        case SsrOpKind.DynamicSlot:
          return { ...op, render: linkSsrFn(op.render) };
        case SsrOpKind.Collection: {
          const row = op.row;
          // inline rows carry a required symbolName; segment rows are { segment: renderFn }
          return {
            ...op,
            row: (typeof (row as { symbolName?: unknown }).symbolName === 'string'
              ? linkSsrFn(row as PlanSsrRenderFn)
              : { segment: linkSsrFn((row as { segment: PlanSsrRenderFn }).segment) }) as never,
          };
        }
        default:
          return op;
      }
    };
    const linkSsrComponent = (ssr: PlanSsrComponent): PlanSsrComponent => {
      const setup = linkSetup(ssr.setup);
      const linked = { ...ssr, setup, ops: linkSsrOps(ssr.ops) };
      localComponentScopes.pop();
      return linked;
    };

    for (const component of modulePlan.components) {
      const hookCapabilities = componentHookCapabilities(moduleIndex, component.hookCalls);
      components.push({
        name: component.name,
        module: moduleIndex,
        propsBindings: component.propsBindings,
        props: component.props,
        ssr: component.ssr === null ? null : linkSsrComponent(component.ssr),
        setup: component.setup,
        needsId: component.needsId,
        idBase: component.idBase,
        providesContext: component.providesContext || hookCapabilities.has('context-provider'),
        runtimeStyleScope: hookCapabilities.has('scoped-styles'),
        ...(component.async === true ? { async: true as const } : {}),
      });
    }
  });

  const pluginFns = new Map<string, PluginFnPlan>();
  for (const plan of modulePlans) {
    for (const fn of plan.pluginFns ?? []) {
      pluginFns.set(fn.fnId, fn);
    }
  }

  return {
    format: 'qwik/ssr-plan',
    version: 1,
    entry: componentOffsets[entryModule] + entryLocal,
    components,
    modules: modulePlans.map((plan) => ({
      path: plan.path,
      segments: plan.segments,
      contexts: plan.contexts,
      defs: plan.defs,
      imports: plan.imports,
    })),
    unresolved,
    pluginFns: [...pluginFns.values()],
  };
}
