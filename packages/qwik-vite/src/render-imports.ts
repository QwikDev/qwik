import { ScopeTracker, isReferenceIdentifier, walk, type WalkOptions } from 'oxc-walker';
import type { Rolldown } from 'vite';
import type { QwikManifest } from './types';

type Node = Parameters<NonNullable<WalkOptions['enter']>>[0];
type Reference = { file: string; name: string; exported?: boolean } | { symbol: string };
type ChunkBindings = {
  bindings: Map<string, Reference[]>;
  exports: Map<string, Reference>;
  reexports: string[];
};

const readString = (node: unknown): string | undefined => {
  const literal = node as
    | {
        value?: unknown;
        type?: string;
        expressions?: unknown[];
        quasis?: { value: { cooked: string } }[];
      }
    | undefined;
  if (typeof literal?.value === 'string') {
    return literal.value;
  }
  if (literal?.type === 'TemplateLiteral' && !literal.expressions?.length) {
    return literal.quasis?.[0].value.cooked;
  }
};

/** Follow QRL exports instead of unrelated shared module definitions. */
export function collectRenderImports(
  chunks: Map<string, Rolldown.OutputChunk>,
  manifest: QwikManifest,
  parse: Rolldown.PluginContext['parse']
) {
  const modules = new Map<string, ChunkBindings>();
  const resolveFile = (file: string, source: string) => {
    const path = file.split('/');
    path.pop();
    for (const part of source.split('/')) {
      if (part === '..') {
        path.pop();
      } else if (part && part !== '.') {
        path.push(part);
      }
    }
    return path.join('/');
  };
  for (const [file, chunk] of chunks) {
    if (!chunk.code || file === manifest.core || !/\.[cm]?js$/.test(file)) {
      continue;
    }
    const program = parse(chunk.code);
    const bindings = new Map<string, Reference[]>();
    const exports = new Map<string, Reference>();
    const reexports: string[] = [];
    const owners = new Map<Node, string[]>();
    const addDeclaration = (node: Node | null | undefined) => {
      if ((node?.type === 'FunctionDeclaration' || node?.type === 'ClassDeclaration') && node.id) {
        bindings.set(node.id.name, []);
        owners.set(node, [node.id.name]);
      }
    };
    for (const statement of program.body) {
      if (statement.type === 'ImportDeclaration') {
        const source = resolveFile(file, statement.source.value);
        for (const specifier of statement.specifiers) {
          const name =
            specifier.type === 'ImportSpecifier'
              ? specifier.imported.type === 'Identifier'
                ? specifier.imported.name
                : specifier.imported.value
              : specifier.type === 'ImportDefaultSpecifier'
                ? 'default'
                : '*';
          bindings.set(specifier.local.name, [{ file: source, name, exported: true }]);
        }
      } else if (statement.type === 'ExportAllDeclaration') {
        reexports.push(resolveFile(file, statement.source.value));
      } else if (statement.type === 'ExportDefaultDeclaration') {
        if (statement.declaration.type === 'Identifier') {
          exports.set('default', { file, name: statement.declaration.name });
        } else if (
          (statement.declaration.type === 'FunctionDeclaration' ||
            statement.declaration.type === 'ClassDeclaration') &&
          statement.declaration.id
        ) {
          addDeclaration(statement.declaration);
          exports.set('default', { file, name: statement.declaration.id.name });
        } else {
          bindings.set('default', []);
          owners.set(statement.declaration, ['default']);
          exports.set('default', { file, name: 'default' });
        }
      } else if (statement.type === 'ExportNamedDeclaration') {
        addDeclaration(statement.declaration);
        for (const specifier of statement.specifiers) {
          const name =
            specifier.exported.type === 'Identifier'
              ? specifier.exported.name
              : specifier.exported.value;
          const local =
            specifier.local.type === 'Identifier' ? specifier.local.name : specifier.local.value;
          exports.set(name, {
            file: statement.source ? resolveFile(file, statement.source.value) : file,
            name: local,
            exported: !!statement.source,
          });
        }
      } else {
        addDeclaration(statement);
      }
    }
    const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });
    walk(program, {
      scopeTracker,
      enter(node) {
        if (node.type !== 'Identifier') {
          return;
        }
        const declaration = scopeTracker.getDeclaration(node.name);
        if (
          declaration?.type !== 'Variable' ||
          declaration.scope !== '' ||
          declaration.node !== node
        ) {
          return;
        }
        bindings.set(node.name, []);
        const initializer = declaration.variableNode.declarations.find(
          ({ id }) => id.start <= node.start && id.end >= node.end
        )?.init;
        if (initializer) {
          owners.set(initializer, [...(owners.get(initializer) || []), node.name]);
        }
      },
    });
    for (const name of chunk.exports) {
      if (!exports.has(name) && bindings.has(name)) {
        exports.set(name, { file, name });
      }
    }
    scopeTracker.freeze();
    const activeOwners: string[][] = [];
    walk(program, {
      scopeTracker,
      enter(node, parent) {
        const owner = owners.get(node);
        if (owner) {
          activeOwners.push(owner);
        }
        const active = activeOwners.at(-1);
        if (!active) {
          return;
        }
        if (node.type === 'CallExpression') {
          const symbol = readString(node.arguments[1]);
          if (
            node.arguments[0]?.type === 'ArrowFunctionExpression' &&
            symbol &&
            manifest.symbols[symbol]
          ) {
            for (const name of active) {
              bindings.get(name)!.push({ symbol });
            }
          }
        } else if (node.type === 'Identifier' && isReferenceIdentifier(node, parent)) {
          const declaration = scopeTracker.getDeclaration(node.name);
          if (declaration?.scope === '' && bindings.has(node.name)) {
            for (const name of active) {
              bindings.get(name)!.push({ file, name: node.name });
            }
          }
        }
      },
      leave(node) {
        if (owners.has(node)) {
          activeOwners.pop();
        }
      },
    });
    modules.set(file, { bindings, exports, reexports });
  }
  const result = new Map<string, string[]>();
  for (const [file, chunk] of chunks) {
    if (!modules.has(file)) {
      continue;
    }
    const imports = new Set<string>();
    const visited = new Set<string>();
    const visit = (reference: Reference) => {
      if ('symbol' in reference) {
        const symbol = manifest.symbols[reference.symbol];
        if (
          symbol.ctxKind === 'function' &&
          /^(component|useStyles|useStylesScoped|useTask|useComputed|createComputed|useResource)\$$/.test(
            symbol.ctxName
          )
        ) {
          const target = manifest.mapping[reference.symbol];
          if (target && target !== file) {
            imports.add(target);
          }
        }
        return;
      }
      const key = `${reference.file}:${reference.exported ? 'export' : 'local'}:${reference.name}`;
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      const module = modules.get(reference.file);
      if (!module) {
        return;
      }
      if (reference.exported) {
        if (reference.name === '*') {
          module.exports.forEach(visit);
          for (const source of module.reexports) {
            visit({ file: source, name: '*', exported: true });
          }
        } else {
          const target = module.exports.get(reference.name);
          if (target) {
            visit(target);
          } else {
            for (const source of module.reexports) {
              visit({ file: source, name: reference.name, exported: true });
            }
          }
        }
      } else {
        module.bindings.get(reference.name)?.forEach(visit);
      }
    };
    for (const symbol of chunk.exports) {
      if (manifest.mapping[symbol] === file) {
        visit({ file, name: symbol, exported: true });
      }
    }
    result.set(file, [...imports]);
  }
  return result;
}
