import { linkSsrPlan, type QwikModulePlan, type QwikSsrPlan } from '@qwik.dev/compiler';
import type { TransformModule } from '@qwik.dev/optimizer';

/**
 * Experimental `ssrPlan` collection (compiler specs/01): SSR transforms emit one `qwik/module-plan`
 * per module; the build links them into an entry-rooted `qwik/ssr-plan` written beside the server
 * bundle.
 */
export interface SsrPlanCollector {
  /** Pull `.plan.json` modules out of a transform result; returns the remaining modules. */
  collect(modules: TransformModule[]): TransformModule[];
  link(): { plan: QwikSsrPlan; entry: string } | null;
  size(): number;
}

/**
 * Resolves a `nativeFrom(path)` target relative to the declaring module. A directory is that
 * language's package; a file is source to splice. Which manifest a package carries is the engine's
 * business, not the build's.
 */
export type NativeTargetResolver = (
  modulePath: string,
  path: string
) => { source: string } | { package: string };

export function createSsrPlanCollector(resolveTarget?: NativeTargetResolver): SsrPlanCollector {
  const plans = new Map<string, QwikModulePlan>();
  return {
    collect(modules) {
      const remaining: TransformModule[] = [];
      for (const mod of modules) {
        if (mod.path.endsWith('.plan.json')) {
          const plan = resolveNativeTargets(JSON.parse(mod.code) as QwikModulePlan, resolveTarget);
          plans.set(plan.path, plan);
        } else {
          remaining.push(mod);
        }
      }
      return remaining;
    },
    link() {
      const sorted = [...plans.values()].sort((left, right) => left.path.localeCompare(right.path));
      const entry = findRenderEntry(sorted);
      if (entry === null) {
        return null;
      }
      const plan = linkSsrPlan(sorted, entry.component, entry.path);
      return plan === null ? null : { plan, entry: `${entry.path}#${entry.component}` };
    },
    size() {
      return plans.size;
    },
  };
}

/** The compiler leaves target paths unresolved — it has no filesystem; the build resolves them. */
function resolveNativeTargets(
  plan: QwikModulePlan,
  resolveTarget: NativeTargetResolver | undefined
): QwikModulePlan {
  if (resolveTarget === undefined || (plan.pluginFns?.length ?? 0) === 0) {
    return plan;
  }
  return {
    ...plan,
    pluginFns: plan.pluginFns.map((fn) => ({
      ...fn,
      targets: Object.fromEntries(
        Object.entries(fn.targets).map(([target, value]) => {
          const path = (value as { path?: string }).path;
          return path === undefined ? [target, value] : [target, resolveTarget(plan.path, path)];
        })
      ),
    })),
  };
}

/** Render-root heuristic: a `Root` component anywhere, else a default export in a root module. */
export function findRenderEntry(
  plans: readonly QwikModulePlan[]
): { path: string; component: string } | null {
  for (const plan of plans) {
    if (plan.components.some((component) => component.name === 'Root')) {
      return { path: plan.path, component: 'Root' };
    }
  }
  for (const plan of plans) {
    if (
      /(^|\/)root\.[jt]sx?$/.test(plan.path) &&
      plan.components.some((component) => component.name === 'default')
    ) {
      return { path: plan.path, component: 'default' };
    }
  }
  return null;
}
