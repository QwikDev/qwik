import type {
  PlanImportMeta,
  PlanNode,
  PlanRenderFn,
  PlanSegmentMeta,
  QwikModulePlan,
} from './emit-plan';
import { PlanNodeKind } from './emit-plan';
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
  readonly version: 0;
  readonly entry: number;
  readonly components: readonly LinkedComponent[];
  readonly modules: readonly LinkedModule[];
  readonly unresolved: readonly (number | string)[];
}

export interface LinkedModule {
  readonly path: string;
  readonly segments: readonly PlanSegmentMeta[];
  readonly contexts: readonly { readonly binding: number; readonly name: string }[];
  readonly defs: QwikModulePlan['defs'];
}

export interface LinkedComponent {
  readonly name: string;
  /** Index into `modules`; segment ids in this component's ops resolve there. */
  readonly module: number;
  readonly propsBindings: readonly number[];
  readonly props: QwikModulePlan['components'][number]['props'];
  readonly ssr: QwikModulePlan['components'][number]['ssr'];
  readonly setup: QwikModulePlan['components'][number]['setup'];
  readonly render: readonly PlanNode[];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly styleScope: string | null;
  readonly providesContext: boolean;
  readonly hasCustomHook: boolean;
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

  modulePlans.forEach((modulePlan, moduleIndex) => {
    const offset = componentOffsets[moduleIndex];
    const componentIndexByBinding = new Map<number, number>();
    modulePlan.components.forEach((component, index) => {
      if (component.binding !== null) {
        componentIndexByBinding.set(component.binding, offset + index);
      }
    });
    const componentIndexByName = new Map(
      modulePlan.components.map((component, index) => [component.name, offset + index] as const)
    );
    const importByBinding = new Map(modulePlan.imports.map((entry) => [entry.binding, entry]));
    const importByName = new Map(modulePlan.imports.map((entry) => [entry.name, entry]));

    const resolveBindingTarget = (binding: number): number | null => {
      const local = componentIndexByBinding.get(binding);
      if (local !== undefined) {
        return local;
      }
      const importMeta = importByBinding.get(binding);
      return importMeta === undefined
        ? null
        : resolveImportedComponent(modulePlan.path, importMeta);
    };
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
        if (entry.op === SetupOpKind.LocalComponent) {
          moduleLocalComponents.add(entry.binding);
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

    const linkNodes = (nodes: readonly PlanNode[]): PlanNode[] => nodes.map(linkNode);
    const linkRenderFn = (fn: PlanRenderFn): PlanRenderFn => ({
      setup: fn.setup,
      render: linkNodes(fn.render),
    });
    const linkNode = (node: PlanNode): PlanNode => {
      switch (node.n) {
        case PlanNodeKind.Element:
          return { ...node, children: linkNodes(node.children) };
        case PlanNodeKind.Component: {
          const target = node.target;
          if (typeof target === 'object') {
            return node; // already linked
          }
          if (moduleLocalComponents.has(target)) {
            return {
              ...node,
              slots: node.slots.map((slot) => ({
                name: slot.name,
                render: linkRenderFn(slot.render),
              })),
            };
          }
          const resolved =
            typeof target === 'number' ? resolveBindingTarget(target) : resolveNameTarget(target);
          if (resolved === null) {
            unresolved.push(target);
          }
          return {
            ...node,
            target: resolved !== null ? { ref: resolved } : target,
            slots: node.slots.map((slot) => ({
              name: slot.name,
              render: linkRenderFn(slot.render),
            })),
          };
        }
        case PlanNodeKind.Branch:
          return {
            ...node,
            then: linkRenderFn(node.then),
            else: node.else === null ? null : linkRenderFn(node.else),
          };
        case PlanNodeKind.Suspense:
          return { ...node, content: linkRenderFn(node.content) };
        case PlanNodeKind.Slot:
          return {
            ...node,
            fallback: node.fallback === null ? null : linkRenderFn(node.fallback),
          };
        case PlanNodeKind.Collection:
          return { ...node, row: linkRenderFn(node.row) };
        default:
          return node;
      }
    };

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
        setup.flatMap((entry) => (entry.op === SetupOpKind.LocalComponent ? [entry.name] : []))
      );
      return setup.map((entry) =>
        entry.op === SetupOpKind.LocalComponent
          ? { ...entry, render: linkSsrFn(entry.render) }
          : entry
      );
    };
    const linkSsrFn = (fn: PlanSsrRenderFn): PlanSsrRenderFn => {
      const setup = linkSetup(fn.setup);
      const linked = { ...fn, setup, ops: linkSsrOps(fn.ops) };
      localComponentScopes.pop();
      return linked;
    };
    const linkSsrOp = (op: PlanSsrOp): PlanSsrOp => {
      switch (op.o) {
        case SsrOpKind.Element:
          return { ...op, children: linkSsrOps(op.children) };
        case SsrOpKind.Component: {
          const target = op.target;
          if (typeof target !== 'string') {
            return op; // already linked
          }
          if (isLocalComponentName(target)) {
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
            ...(op.fallbackRender === undefined
              ? {}
              : { fallbackRender: linkSsrFn(op.fallbackRender) }),
            inOrder: op.inOrder === null ? null : linkSsrOps(op.inOrder),
          };
        case SsrOpKind.Slot:
          return { ...op, fallback: op.fallback === null ? null : linkSsrFn(op.fallback) };
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
      components.push({
        name: component.name,
        module: moduleIndex,
        propsBindings: component.propsBindings,
        props: component.props,
        ssr: component.ssr === null ? null : linkSsrComponent(component.ssr),
        setup: component.setup,
        render: linkNodes(component.render),
        needsId: component.needsId,
        idBase: component.idBase,
        styleScope: component.styleScope,
        providesContext: component.providesContext,
        hasCustomHook: component.hasCustomHook,
      });
    }
  });

  return {
    format: 'qwik/ssr-plan',
    version: 0,
    entry: componentOffsets[entryModule] + entryLocal,
    components,
    modules: modulePlans.map((plan) => ({
      path: plan.path,
      segments: plan.segments,
      contexts: plan.contexts,
      defs: plan.defs,
    })),
    unresolved,
  };
}
