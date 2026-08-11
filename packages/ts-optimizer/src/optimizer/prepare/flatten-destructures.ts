/**
 * Flatten `const <ObjectPattern> = useFoo()` destructures inside `component$` bodies as a
 * pre-extraction code-size optimization. `const { store5 } = useForm2()` becomes `const form2 =
 * useForm2()` and every `store5` reference rewrites to `form2.store5` (the new binding drops the
 * `use` prefix and lowercases the first char). Only object-pattern destructures of a `use`-prefixed
 * identifier callee are handled; array and member-init forms are left alone.
 */

import MagicString from 'magic-string';
import { parseWithRawTransfer } from '../ast/parse.js';
import { walk } from 'oxc-walker';
import type { AstNode, AstParentNode, AstProgram, CallExpression } from '../../ast-types.js';

type Substitution = { from: string; to: string };

export function flattenDestructureUseCalls(
  source: string,
  relPath: string,
  program: AstProgram
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
        const hit = subs.find((sub) => sub.from === node.name);
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
 * True when an Identifier sits in a declaring position (introducing a binding, an object-literal
 * key, a label) rather than a reference — only references to flattened names get rewritten.
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

interface PatternFields {
  fields: Array<{ localName: string; keyName: string }>;
}

function extractPatternFields(id: AstNode): PatternFields | null {
  const props = (id as unknown as { properties?: AstNode[] }).properties ?? [];
  const fields: Array<{ localName: string; keyName: string }> = [];
  for (const prop of props) {
    if (prop.type !== 'Property') return null;
    if (prop.computed) return null;
    const key = prop.key;
    const keyName =
      key.type === 'Identifier' ? key.name : key.type === 'Literal' ? String(key.value) : null;
    if (keyName === null) return null;
    const val = prop.value;
    if (val.type !== 'Identifier') return null;
    fields.push({ localName: val.name, keyName });
  }
  return fields.length > 0 ? { fields } : null;
}

/**
 * For each flattenable store-rooted declaration chain at the top level of a `component$(arrow)`
 * body: the seed `const {…} = use*(…)[.path]` becomes `const <binding> = use*(…)`, and follow-up
 * aliases (`const y = x`, `const b = y.bye`, `const {c} = b.z`) fold into the root member chain
 * with their declarations removed — every reference rides the store object so subscriptions track
 * the full path.
 */
function collectAndApplyDeclsForComponentCall(
  callNode: CallExpression,
  edits: () => MagicString,
  decls: FlattenableDecl[],
  subsByScope: Map<number, Substitution[]>
): void {
  const arrow = callNode.arguments?.[0];
  if (!arrow || arrow.type !== 'ArrowFunctionExpression') return;
  const body = arrow.body;
  if (!body || body.type !== 'BlockStatement') return;
  const scopeStart = body.start;
  const scopeEnd = body.end;

  const localSubs = new Map<string, string>();
  const pushSub = (from: string, to: string): void => {
    localSubs.set(from, to);
    const existing = subsByScope.get(scopeStart) ?? [];
    subsByScope.set(scopeStart, [...existing, { from, to }]);
  };

  // Resolve an init to `{ callNode, suffix }` when it is a `use*()` call plus
  // an optional non-computed member path.
  const resolveSeedInit = (init: AstNode): { call: CallExpression; suffix: string } | null => {
    let suffix = '';
    let current: AstNode = init;
    while (current.type === 'MemberExpression') {
      const member = current as unknown as {
        computed?: boolean;
        property: AstNode & { name?: string };
        object: AstNode;
      };
      if (member.computed || member.property.type !== 'Identifier') return null;
      suffix = `.${member.property.name}${suffix}`;
      current = member.object;
    }
    if (current.type !== 'CallExpression') return null;
    const call = current as CallExpression;
    if (!call.callee || call.callee.type !== 'Identifier') return null;
    const calleeName = call.callee.name;
    if (!calleeName.startsWith('use') || calleeName.length <= 3) return null;
    // Skip marker hooks (`use*$` / `use*Qrl`) — the qrl rewrite re-targets
    // these, so flattening them here would conflict.
    if (calleeName.endsWith('$') || calleeName.endsWith('Qrl')) return null;
    return { call, suffix };
  };

  // Resolve an init already rooted at a tracked local to a substituted path.
  const resolveTrackedInit = (init: AstNode): string | null => {
    let suffix = '';
    let current: AstNode = init;
    while (current.type === 'MemberExpression') {
      const member = current as unknown as {
        computed?: boolean;
        property: AstNode & { name?: string };
        object: AstNode;
      };
      if (member.computed || member.property.type !== 'Identifier') return null;
      suffix = `.${member.property.name}${suffix}`;
      current = member.object;
    }
    if (current.type !== 'Identifier') return null;
    const root = localSubs.get((current as unknown as { name: string }).name);
    if (root === undefined) return null;
    return root + suffix;
  };

  const removeStmt = (stmt: AstNode): void => {
    edits().remove(stmt.start, stmt.end);
    decls.push({
      idStart: stmt.start,
      idEnd: stmt.end,
      scopeStart,
      scopeEnd,
      declStart: stmt.start,
      declEnd: stmt.end,
      newBinding: '',
      fields: [],
    });
  };

  for (const stmt of body.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    if ((stmt.declarations ?? []).length !== 1) continue;
    const declarator = stmt.declarations[0];
    const init = declarator.init;
    const id = declarator.id;
    if (!init) continue;

    const seed = id.type === 'ObjectPattern' ? resolveSeedInit(init) : null;
    if (seed) {
      const pattern = extractPatternFields(id);
      if (!pattern) continue;
      const calleeName = (seed.call.callee as unknown as { name: string }).name;
      const newBinding = `${calleeName.slice(3, 4).toLowerCase()}${calleeName.slice(4)}`;
      const decl: FlattenableDecl = {
        idStart: id.start,
        idEnd: id.end,
        scopeStart,
        scopeEnd,
        declStart: stmt.start,
        declEnd: stmt.end,
        newBinding,
        fields: pattern.fields,
      };
      decls.push(decl);
      edits().overwrite(decl.idStart, decl.idEnd, newBinding);
      // Move the member suffix off the declaration into the references.
      if (seed.suffix !== '') {
        edits().remove(seed.call.end, init.end);
      }
      for (const field of pattern.fields) {
        pushSub(field.localName, `${newBinding}${seed.suffix}.${field.keyName}`);
      }
      continue;
    }

    if (localSubs.size === 0) continue;
    const resolved = resolveTrackedInit(init);
    if (resolved === null) continue;

    if (id.type === 'Identifier') {
      pushSub((id as unknown as { name: string }).name, resolved);
      removeStmt(stmt);
    } else if (id.type === 'ObjectPattern') {
      const pattern = extractPatternFields(id);
      if (!pattern) continue;
      for (const field of pattern.fields) {
        pushSub(field.localName, `${resolved}.${field.keyName}`);
      }
      removeStmt(stmt);
    }
  }
}

/** Parse, flatten, then re-parse the flattened source. */
export function flattenAndReparse(
  source: string,
  relPath: string,
  program: AstProgram
): {
  source: string;
  program: AstProgram;
  module: ReturnType<typeof parseWithRawTransfer>['module'] | null;
  changed: boolean;
} {
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
