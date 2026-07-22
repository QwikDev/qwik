/**
 * Flatten `const <ObjectPattern> = useFoo()` destructures inside `component$`
 * bodies as a pre-extraction code-size optimization. `const { store5 } =
 * useForm2()` becomes `const form2 = useForm2()` and every `store5` reference
 * rewrites to `form2.store5` (the new binding drops the `use` prefix and
 * lowercases the first char). Only object-pattern destructures of a
 * `use`-prefixed identifier callee are handled; array and member-init forms
 * are left alone.
 */

import MagicString from 'magic-string';
import { parseWithRawTransfer } from '../ast/parse.js';
import { walk } from 'oxc-walker';
import type { AstNode, AstParentNode, AstProgram, CallExpression } from '../../ast-types.js';

type Substitution = { from: string; to: string };

export function flattenDestructureUseCalls(
  source: string,
  relPath: string,
  program: AstProgram,
): { source: string; changed: boolean } {
  // Sound prefilter: the walk only fires on a callee literally named
  // `component$`, and that token appears verbatim at its source position, so
  // a module whose text lacks it cannot match.
  if (!source.includes('component$')) {
    return { source, changed: false };
  }

  // Lazily materialize MagicString on first overwrite — most prefiltered
  // modules still have no flattenable decls.
  let s: MagicString | undefined;
  const edits = (): MagicString => (s ??= new MagicString(source));
  const decls: FlattenableDecl[] = [];
  const subsByScope = new Map<number, Substitution[]>();

  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      // Manually iterating the body's top-level statements (rather than the
      // walker's VariableDeclaration visits) keeps nested function-body decls
      // from being flattened.
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'component$'
      ) {
        collectAndApplyDeclsForComponentCall(node, edits, decls, subsByScope);
        return;
      }

      if (node.type !== 'Identifier' || !node.name) return;
      if (decls.length === 0) return;
      if (isDeclaringIdentifierPosition(node, parent)) return;
      // Skip identifiers inside an already-overwritten decl pattern range —
      // magic-string throws on splitting an edited chunk. Shorthand
      // destructure values (`{url}`) resolve to the same Identifier and slip
      // past the declaring-position check above.
      for (const d of decls) {
        if (node.start >= d.idStart && node.end <= d.idEnd) return;
      }
      // First scope match in source order wins (outermost scope governs).
      for (const decl of decls) {
        if (node.start < decl.scopeStart || node.end > decl.scopeEnd) continue;
        const subs = subsByScope.get(decl.scopeStart);
        if (!subs) continue;
        const hit = subs.find(sub => sub.from === node.name);
        if (!hit) continue;
        let replacement = hit.to;
        if (isShorthandPropertyValue(node, parent)) {
          replacement = `${node.name}: ${hit.to}`;
        }
        edits().overwrite(node.start, node.end, replacement);
        return;
      }
    },
  });

  if (s === undefined || !s.hasChanged()) return { source, changed: false };
  return { source: s.toString(), changed: true };
}

/**
 * True when an Identifier sits in a declaring position (introducing a binding,
 * an object-literal key, a label) rather than a reference — only references to
 * flattened names get rewritten.
 */
function isDeclaringIdentifierPosition(node: AstNode, parent: AstParentNode): boolean {
  if (!parent) return false;
  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.id === node;
    case 'Property':
      return parent.key === node && !parent.computed;
    case 'MemberExpression':
      return parent.property === node && !parent.computed;
    case 'ImportSpecifier':
      return parent.imported === node || parent.local === node;
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return parent.local === node;
    case 'ExportSpecifier':
      return parent.exported === node || parent.local === node;
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return parent.label === node;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return parent.id === node;
    default:
      return false;
  }
}

export function isShorthandPropertyValue(node: AstNode, parent: AstParentNode): boolean {
  return parent?.type === 'Property' && parent.shorthand === true && parent.value === node;
}

interface FlattenableDecl {
  idStart: number;
  idEnd: number;
  scopeStart: number;
  scopeEnd: number;
  declStart: number;
  declEnd: number;
  newBinding: string;
  fields: Array<{ localName: string; keyName: string }>;
}

/**
 * For each flattenable `const { ... } = use*()` at the top level of a
 * `component$(arrow)` body with a BlockStatement, record a FlattenableDecl,
 * overwrite its pattern, and register the substitution map under the body's
 * span. Other call shapes are ignored.
 */
function collectAndApplyDeclsForComponentCall(
  callNode: CallExpression,
  edits: () => MagicString,
  decls: FlattenableDecl[],
  subsByScope: Map<number, Substitution[]>,
): void {
  const arrow = callNode.arguments?.[0];
  if (!arrow || arrow.type !== 'ArrowFunctionExpression') return;
  const body = arrow.body;
  if (!body || body.type !== 'BlockStatement') return;
  const scopeStart = body.start;
  const scopeEnd = body.end;
  for (const stmt of body.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    if ((stmt.declarations ?? []).length !== 1) continue;
    const declarator = stmt.declarations[0];
    const init = declarator.init;
    const id = declarator.id;
    if (!init || init.type !== 'CallExpression') continue;
    if (!init.callee || init.callee.type !== 'Identifier') continue;
    const calleeName = init.callee.name;
    if (!calleeName.startsWith('use') || calleeName.length <= 3) continue;
    // Skip marker hooks (`use*$` / `use*Qrl`) — the qrl rewrite re-targets
    // these, so flattening them here would conflict.
    if (calleeName.endsWith('$') || calleeName.endsWith('Qrl')) continue;
    if (id.type !== 'ObjectPattern') continue;
    const fields: Array<{ localName: string; keyName: string }> = [];
    for (const prop of id.properties ?? []) {
      if (prop.type !== 'Property') continue;
      if (prop.computed) continue;
      const key = prop.key;
      const keyName = key.type === 'Identifier' ? key.name : (key.type === 'Literal' ? String(key.value) : null);
      if (keyName === null) continue;
      const val = prop.value;
      if (val.type !== 'Identifier') continue;
      fields.push({ localName: val.name, keyName });
    }
    if (fields.length === 0) continue;
    const newBinding = `${calleeName.slice(3, 4).toLowerCase()}${calleeName.slice(4)}`;
    const decl: FlattenableDecl = {
      idStart: id.start,
      idEnd: id.end,
      scopeStart,
      scopeEnd,
      declStart: stmt.start,
      declEnd: stmt.end,
      newBinding,
      fields,
    };
    decls.push(decl);
    edits().overwrite(decl.idStart, decl.idEnd, decl.newBinding);
    const subs: Substitution[] = decl.fields.map(field => ({
      from: field.localName,
      to: `${decl.newBinding}.${field.keyName}`,
    }));
    const existing = subsByScope.get(decl.scopeStart) ?? [];
    subsByScope.set(decl.scopeStart, [...existing, ...subs]);
  }
}

/** Parse, flatten, then re-parse the flattened source. */
export function flattenAndReparse(
  source: string,
  relPath: string,
  program: AstProgram,
): { source: string; program: AstProgram; module: ReturnType<typeof parseWithRawTransfer>['module'] | null; changed: boolean } {
  const result = flattenDestructureUseCalls(source, relPath, program);
  if (!result.changed) {
    return { source, program, module: null, changed: false };
  }
  const reparsed = parseWithRawTransfer(relPath, result.source);
  return {
    source: result.source,
    program: reparsed.program,
    module: reparsed.module,
    changed: true,
  };
}
