/** Pure module linking over plans and host-provided resolver/plugin snapshots. */
import {
  DeclTable,
  EntryKind,
  EsmEdgeKind,
  ExportKind,
  ImportTargetKind,
  UnknownWhy,
  type DeclRef,
  type LinkedImport,
  type LinkedModule,
  type LinkedPlan,
  type LocalId,
  type ModulePlan,
  type Unknown,
} from '../schema';
import { sameDecl, type Resolution } from './resolve';
import type { LinkDiagnostic, LinkEntry } from './link-plans';

/** The roots of the reachability walk, one per requested entry. */
export function resolveEntries(
  plans: readonly ModulePlan[],
  entries: readonly LinkEntry[],
  resolution: Resolution,
  diagnostics: LinkDiagnostic[]
): LinkedPlan['entries'] {
  const { resolveExport, linkedEdges, moduleByPath } = resolution;
  const linkedEntries: LinkedPlan['entries'] = [];
  const exportedNames = (module: number, seen = new Set<number>()): Set<string> => {
    const names = new Set<string>();
    if (seen.has(module)) {
      return names;
    }
    seen.add(module);
    for (const exported of plans[module].exports) {
      if (exported.e !== ExportKind.Star) {
        names.add(exported.exported);
      } else {
        const target = linkedEdges[module][exported.edge].target;
        if (target.ok) {
          for (const name of exportedNames(target.value, seen)) {
            if (name !== 'default') {
              names.add(name);
            }
          }
        }
      }
    }
    return names;
  };
  for (const entry of entries) {
    const module = moduleByPath.get(entry.module);
    if (module === undefined) {
      diagnostics.push({
        module: entry.module,
        code: 'unresolved-entry',
        message: `Entry module "${entry.module}" is not among the linked plans.`,
      });
      continue;
    }
    if (entry.kind === EntryKind.Module) {
      linkedEntries.push({ kind: EntryKind.Module, module });
      if (entry.exposeExports) {
        for (const name of exportedNames(module)) {
          linkedEntries.push({
            kind: EntryKind.Export,
            module,
            export: name,
            target: resolveExport(module, name),
          });
        }
      }
    } else {
      linkedEntries.push({
        kind: EntryKind.Export,
        module,
        export: entry.export,
        target: resolveExport(module, entry.export),
      });
    }
  }
  return linkedEntries;
}

/** Walks every root, marking runtime edges and reporting what a complete link cannot resolve. */
export function markReachable(
  plans: readonly ModulePlan[],
  linkedModules: LinkedModule[],
  linkedEntries: LinkedPlan['entries'],
  resolution: Resolution,
  complete: boolean,
  diagnostics: LinkDiagnostic[]
): Set<string> {
  const { importsByBinding, resolveExport, resolveLocalBinding, qrlIndexes } = resolution;
  const visited = new Set<string>();
  const visitedModules = new Set<number>();
  const reportImport = (module: number, imported: LinkedImport): void => {
    if (imported.kind === ImportTargetKind.TypeOnly || imported.target.ok) {
      return;
    }
    if (imported.target.reason.why === UnknownWhy.External) {
      return;
    }
    const specifier = plans[module].edges[imported.source.edge].specifier;
    diagnostics.push(importDiagnostic(plans[module].path, specifier, imported.target.reason));
  };
  const visitModuleSideEffects = (module: number): void => {
    if (visitedModules.has(module)) {
      return;
    }
    visitedModules.add(module);
    for (const edge of linkedModules[module].edges) {
      if (edge.kind !== EsmEdgeKind.SideEffect || edge.typeOnly) {
        continue;
      }
      edge.runtime = true;
      if (edge.target.ok) {
        visitModuleSideEffects(edge.target.value);
      } else if (complete && edge.target.reason.why !== UnknownWhy.External) {
        diagnostics.push(importDiagnostic(plans[module].path, edge.specifier, edge.target.reason));
      }
    }
  };
  const markExportPath = (module: number, exported: string, seen = new Set<string>()): void => {
    const key = `${module}:${exported}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const expected = resolveExport(module, exported);
    if (!expected.ok) {
      return;
    }
    for (const entry of plans[module].exports) {
      if (entry.e === ExportKind.Local) {
        continue;
      }
      if (entry.e === ExportKind.Reexport && entry.exported !== exported) {
        continue;
      }
      if (entry.e === ExportKind.Star && exported === 'default') {
        continue;
      }
      const edge = linkedModules[module].edges[entry.edge];
      if (!edge.target.ok) {
        continue;
      }
      const imported = entry.e === ExportKind.Reexport ? entry.imported : exported;
      if (imported === '*') {
        continue;
      }
      const candidate = resolveExport(edge.target.value, imported);
      if (!candidate.ok || !sameDecl(candidate.value, expected.value)) {
        continue;
      }
      edge.runtime = true;
      visitModuleSideEffects(edge.target.value);
      markExportPath(edge.target.value, imported, seen);
    }
  };
  const visitDecl = (decl: DeclRef): void => {
    const key = `${decl.module}:${decl.table}:${decl.index}`;
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    visitModuleSideEffects(decl.module);
    if (decl.table !== DeclTable.Qrls) {
      return;
    }
    const qrl = linkedModules[decl.module].qrls[decl.index];
    for (const binding of qrl.dependencies.bindings) {
      visitImport(decl.module, binding);
      const local = resolveLocalBinding(decl.module, binding);
      if (local.ok) {
        visitDecl(local.value);
      }
    }
    for (const id of qrl.dependencies.qrls) {
      const index = qrlIndexes[decl.module].get(id);
      if (index !== undefined) {
        visitDecl({ module: decl.module, table: DeclTable.Qrls, index });
      }
    }
  };
  const visitImport = (module: number, binding: LocalId): void => {
    const imported = importsByBinding[module].get(binding);
    const key = `import:${module}:${binding}`;
    if (imported === undefined || visited.has(key)) {
      return;
    }
    visited.add(key);
    linkedModules[module].edges[imported.source.edge].runtime = !imported.source.typeOnly;
    const targetModule = linkedModules[module].edges[imported.source.edge].target;
    if (
      targetModule.ok &&
      imported.kind === ImportTargetKind.Declaration &&
      imported.source.imported !== '*'
    ) {
      visitModuleSideEffects(targetModule.value);
      markExportPath(targetModule.value, imported.source.imported);
    }
    if (complete) {
      reportImport(module, imported);
    }
    if (imported.kind === ImportTargetKind.Declaration && imported.target.ok) {
      visitDecl(imported.target.value);
    }
  };

  for (const entry of linkedEntries) {
    if (entry.kind === EntryKind.Export) {
      if (entry.target.ok) {
        visitDecl(entry.target.value);
      } else if (complete && entry.target.reason.why !== UnknownWhy.External) {
        diagnostics.push(
          exportDiagnostic(plans[entry.module].path, entry.export, entry.target.reason)
        );
      }
    } else {
      visitModuleSideEffects(entry.module);
      for (const exported of plans[entry.module].exports) {
        if (exported.e === ExportKind.Star) {
          continue;
        }
        const target = resolveExport(entry.module, exported.exported);
        if (target.ok) {
          visitDecl(target.value);
        }
      }
    }
  }

  return visited;
}

function importDiagnostic(module: string, specifier: string, reason: Unknown): LinkDiagnostic {
  switch (reason.why) {
    case UnknownWhy.Failed:
      return { module, code: 'failed-edge', message: `Resolver failed for "${specifier}".` };
    case UnknownWhy.Cycle:
      return { module, code: 'cyclic-export', message: `Export cycle through "${specifier}".` };
    case UnknownWhy.Opaque:
      return {
        module,
        code: reason.code,
        message:
          reason.code === 'missing-export'
            ? `The target of "${specifier}" does not export the requested name.`
            : `Unable to link "${specifier}": ${reason.code}.`,
      };
    default:
      return { module, code: 'unresolved-edge', message: `Unable to resolve "${specifier}".` };
  }
}

function exportDiagnostic(module: string, exported: string, reason: Unknown): LinkDiagnostic {
  const code =
    reason.why === UnknownWhy.Cycle
      ? 'cyclic-export'
      : reason.why === UnknownWhy.Opaque
        ? reason.code
        : 'missing-export';
  return { module, code, message: `Unable to link export "${exported}" from "${module}".` };
}
