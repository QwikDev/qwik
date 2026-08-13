import type { TransformModuleInput } from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';

/**
 * Cross-module context kinds: `useContext(...)` values are opaque to the type system, but the
 * provider side is visible in the compile unit. This pre-pass records which `createContextId`
 * contexts are provided with a signal/store/computed, so consumers can emit tracked prop getters
 * and serialization stores the source instead of a snapshot.
 */
export type ContextSourceKind = 'signal' | 'store' | 'computed';

const HOOK_KINDS: Record<string, ContextSourceKind> = {
  useSignal: 'signal',
  useStore: 'store',
  useComputed$: 'computed',
  useComputedQrl: 'computed',
};

let contextKindByName = new Map<string, ContextSourceKind>();
/** `<modulePathWithoutExtension>#<exportedName>` → context name. */
let contextNameByExport = new Map<string, string>();

export function contextKindForName(name: string): ContextSourceKind | null {
  return contextKindByName.get(name) ?? null;
}

export function contextNameForImport(
  importerPath: string,
  source: string,
  importedName: string
): string | null {
  const resolved = resolveSpecifier(importerPath, source);
  return resolved === null
    ? null
    : (contextNameByExport.get(`${resolved}#${importedName}`) ?? null);
}

interface AstNode {
  type: string;
  [key: string]: unknown;
}

interface ModuleScan {
  readonly path: string;
  /** Local context-id names → context name string. */
  readonly localContexts: Map<string, string>;
  /** Provider calls: context reference (local name or import) + provided value's local name. */
  readonly providers: { context: string; value: string }[];
  /** Local reactive declarations by name; `null` marks a shadowed, conflicting name. */
  readonly valueKinds: Map<string, ContextSourceKind | null>;
  /** Imported local names → [source, importedName] for qwik-agnostic modules. */
  readonly imports: Map<string, readonly [string, string]>;
  /** Exported name → local name. */
  readonly exports: Map<string, string>;
}

export function registerContextKinds(inputs: readonly TransformModuleInput[]): void {
  const scans: ModuleScan[] = [];
  for (const input of inputs) {
    if (!input.code.includes('createContextId') && !input.code.includes('useContextProvider')) {
      continue;
    }
    try {
      scans.push(scanModule(input.path, input.code));
    } catch {
      // a parse failure surfaces from the real transform, with proper diagnostics
    }
  }

  const nameByExport = new Map<string, string>();
  for (const scan of scans) {
    for (const [exported, local] of scan.exports) {
      const name = scan.localContexts.get(local);
      if (name !== undefined) {
        nameByExport.set(`${pathKey(scan.path)}#${exported}`, name);
      }
    }
  }

  const kinds = new Map<string, ContextSourceKind | null>();
  for (const scan of scans) {
    for (const provider of scan.providers) {
      const imported = scan.imports.get(provider.context);
      const contextName =
        scan.localContexts.get(provider.context) ??
        (imported === undefined
          ? undefined
          : (nameByExport.get(`${resolveSpecifier(scan.path, imported[0]) ?? ''}#${imported[1]}`) ??
            undefined));
      const kind = scan.valueKinds.get(provider.value);
      if (contextName === undefined || kind == null) {
        continue;
      }
      const previous = kinds.get(contextName);
      // conflicting provider kinds make the context untrackable
      kinds.set(contextName, previous === undefined || previous === kind ? kind : null);
    }
  }

  contextNameByExport = nameByExport;
  contextKindByName = new Map(
    [...kinds].flatMap(([name, kind]) => (kind === null ? [] : [[name, kind] as const]))
  );
}

function scanModule(path: string, code: string): ModuleScan {
  const parsed = parseSync(path, code, { lang: path.endsWith('x') ? 'tsx' : 'ts' });
  const program = parsed.program as unknown as AstNode;
  const scan: ModuleScan = {
    path,
    localContexts: new Map(),
    providers: [],
    valueKinds: new Map(),
    imports: new Map(),
    exports: new Map(),
  };
  const qwikLocals = new Map<string, string>();

  for (const statement of program.body as AstNode[]) {
    if (statement.type === 'ImportDeclaration') {
      const source = (statement.source as AstNode).value as string;
      for (const spec of (statement.specifiers as AstNode[]) ?? []) {
        if (spec.type !== 'ImportSpecifier') {
          continue;
        }
        const local = (spec.local as AstNode).name as string;
        const imported = ((spec.imported as AstNode)?.name as string) ?? local;
        scan.imports.set(local, [source, imported]);
        if (source.startsWith('@qwik.dev/') || source === 'qwik') {
          qwikLocals.set(local, imported);
        }
      }
    } else if (statement.type === 'ExportNamedDeclaration') {
      for (const spec of (statement.specifiers as AstNode[]) ?? []) {
        scan.exports.set(
          ((spec.exported as AstNode)?.name as string) ?? '',
          ((spec.local as AstNode)?.name as string) ?? ''
        );
      }
    }
  }

  walk(program, (node) => {
    if (node.type === 'VariableDeclarator') {
      const id = node.id as AstNode;
      const init = node.init as AstNode | null;
      if (id?.type !== 'Identifier' || init?.type !== 'CallExpression') {
        return;
      }
      const callee = init.callee as AstNode;
      if (callee?.type !== 'Identifier') {
        return;
      }
      const hook = qwikLocals.get(callee.name as string);
      const local = id.name as string;
      if (hook === 'createContextId') {
        const first = (init.arguments as AstNode[])[0];
        if (first?.type === 'Literal' && typeof first.value === 'string') {
          scan.localContexts.set(local, first.value);
        }
      } else if (hook !== undefined && hook in HOOK_KINDS) {
        // a name declared twice with different kinds is unusable for classification
        const previous = scan.valueKinds.get(local);
        const kind = HOOK_KINDS[hook];
        scan.valueKinds.set(local, previous === undefined || previous === kind ? kind : null);
      }
    } else if (node.type === 'CallExpression') {
      const callee = node.callee as AstNode;
      if (
        callee?.type !== 'Identifier' ||
        qwikLocals.get(callee.name as string) !== 'useContextProvider'
      ) {
        return;
      }
      const [contextArg, valueArg] = node.arguments as AstNode[];
      if (contextArg?.type === 'Identifier' && valueArg?.type === 'Identifier') {
        scan.providers.push({
          context: contextArg.name as string,
          value: valueArg.name as string,
        });
      }
    }
  });

  // `export const X = createContextId(...)` exports under the local name
  for (const statement of program.body as AstNode[]) {
    if (
      statement.type === 'ExportNamedDeclaration' &&
      (statement.declaration as AstNode)?.type === 'VariableDeclaration'
    ) {
      for (const declarator of ((statement.declaration as AstNode).declarations as AstNode[]) ??
        []) {
        const id = declarator.id as AstNode;
        if (id?.type === 'Identifier') {
          scan.exports.set(id.name as string, id.name as string);
        }
      }
    }
  }

  return scan;
}

function walk(node: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visit);
    }
    return;
  }
  if (typeof node !== 'object' || node === null || typeof (node as AstNode).type !== 'string') {
    return;
  }
  visit(node as AstNode);
  for (const key of Object.keys(node)) {
    if (key !== 'type') {
      walk((node as Record<string, unknown>)[key], visit);
    }
  }
}

function pathKey(path: string): string {
  return path.replace(/\.[jt]sx?$/, '');
}

function resolveSpecifier(importerPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
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
  return pathKey(stack.join('/'));
}
