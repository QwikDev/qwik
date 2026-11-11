import type { Program } from 'oxc-parser';
import type { ModulePlan } from '../schema';

/**
 * The outermost name around each QRL, like the v2 optimizers' context stack: a declared const,
 * function or class, or the file stem for an anonymous default export.
 */
export function recordRootContexts(plan: ModulePlan, program: Program, path: string): void {
  for (const qrl of plan.qrls) {
    const [start] = qrl.origin.range;
    const statement = program.body.find((node) => node.start <= start && start < node.end);
    const root = statement === undefined ? null : rootName(statement, start, path);
    if (root !== null) {
      qrl.rootContext = root;
    }
  }
}

function rootName(statement: Program['body'][number], start: number, path: string): string | null {
  const declaration =
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
      ? statement.declaration
      : statement;
  if (declaration === null) {
    return null;
  }
  switch (declaration.type) {
    case 'VariableDeclaration': {
      // A component's range starts at the statement, ahead of its declarator.
      const declarator = declaration.declarations.find((node) => start < node.end);
      return declarator?.id.type === 'Identifier' ? declarator.id.name : null;
    }
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      if (declaration.id !== null) {
        return declaration.id.name;
      }
  }
  return statement.type === 'ExportDefaultDeclaration' ? fileStem(path) : null;
}

/** The basename without its last extension, as the v2 optimizers name a default export. */
function fileStem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}
