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

export function createSsrPlanCollector(): SsrPlanCollector {
  const plans = new Map<string, QwikModulePlan>();
  return {
    collect(modules) {
      const remaining: TransformModule[] = [];
      for (const mod of modules) {
        if (mod.path.endsWith('.plan.json')) {
          const plan = JSON.parse(mod.code) as QwikModulePlan;
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
