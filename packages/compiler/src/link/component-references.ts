import {
  DeclTable,
  ResultKind,
  ValueIrKind,
  type DeclRef,
  type LinkedModule,
  type LocalId,
  type Maybe,
  type ModulePlan,
} from '../schema';
import { QWIK_CORE_IMPORT, QwikMarker } from '../words';
import type { LinkDiagnostic } from './link-plans';

/**
 * `component$(X)`: an `X` that is a component already is aliased instead of compiled twice, and an
 * imported plain function is refused, because only its own module can compile it as a component.
 */
export function linkComponentReferences(
  plans: readonly ModulePlan[],
  modules: readonly LinkedModule[],
  resolveBinding: (module: number, binding: LocalId) => Maybe<DeclRef>
): LinkDiagnostic[] {
  const diagnostics: LinkDiagnostic[] = [];
  const isComponent = (target: Maybe<DeclRef>) =>
    target.ok && target.value.table === DeclTable.Qrls;
  modules.forEach((module, moduleIndex) => {
    for (const qrl of module.qrls) {
      const referenced = qrl.declaration?.componentOf;
      if (referenced !== undefined && isComponent(resolveBinding(moduleIndex, referenced))) {
        qrl.aliasOf = referenced;
      }
    }
    const plan = plans[moduleIndex];
    const importOf = (binding: LocalId) =>
      plan.imports.find((entry) => entry.binding === binding && !entry.typeOnly);
    for (const { callee, args } of module.invocations ?? []) {
      const marker = callee.kind === ValueIrKind.BindingRead ? importOf(callee.binding) : undefined;
      const argument = args[0];
      if (
        marker?.imported !== QwikMarker.Component ||
        plan.edges[marker.edge].specifier !== QWIK_CORE_IMPORT ||
        argument?.kind !== ValueIrKind.BindingRead
      ) {
        continue;
      }
      const imported = importOf(argument.binding);
      const target = imported === undefined ? null : resolveBinding(moduleIndex, argument.binding);
      if (imported === undefined || target === null || !target.ok || isComponent(target)) {
        continue;
      }
      let declared =
        target.value.table === DeclTable.Bindings
          ? modules[target.value.module].bindings[target.value.index].result?.value
          : undefined;
      while (declared?.kind === ResultKind.Union && declared.values.length === 1) {
        declared = declared.values[0];
      }
      const isFunction =
        target.value.table === DeclTable.Callables || declared?.kind === ResultKind.Function;
      if (!isFunction) {
        continue;
      }
      const name = plan.bindings[argument.binding].name;
      diagnostics.push({
        module: plan.path,
        code: 'component-of-imported-function',
        message:
          `component$(${name}): "${name}" from "${plan.edges[imported.edge].specifier}" is a plain ` +
          `function, and a function can only be compiled as a component in its own module. ` +
          `Wrap it where it is declared — export const ${name} = component$(...) — ` +
          `or move the function into "${plan.path}".`,
      });
    }
  });
  return diagnostics;
}
