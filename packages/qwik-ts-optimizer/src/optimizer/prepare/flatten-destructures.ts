/**
 * Flatten `const <pat> = useFooBar()` destructures inside `component$`
 * bodies, mirroring SWC's `PropsDestructuring::transform_component_body`
 * (`swc-reference-only/props_destructuring.rs:108-260`).
 *
 * The rewrite is a code-size optimization the Qwik Rust optimizer
 * applies before extraction. A declaration like:
 *
 *     const { store5 } = useForm2();
 *
 * becomes:
 *
 *     const form2 = useForm2();
 *
 * and every reference to `store5` in the same scope rewrites to
 * `form2.store5`. The new binding name is derived from the callee by
 * stripping the `use` prefix and lowercasing the first character
 * (`useForm2` → `form2`).
 *
 * Only `const <ObjectPattern> = <ident-callee starting with "use">` is
 * handled here. Array destructures and member-init forms are left alone
 * — the SWC rule for those branches is more involved (substituting
 * member accesses, handling rest elements) and the convergence tests
 * exercise the object-pattern path primarily. Extend when a second test
 * demands it.
 */

import MagicString from 'magic-string';
import { parseWithRawTransfer } from '../ast/parse.js';
import { walk } from 'oxc-walker';
import type { AstNode, AstParentNode, AstProgram, CallExpression } from '../../ast-types.js';

/**
 * Apply destructure flattening to a source string. Returns the rewritten
 * source (or the original if nothing changed) along with the re-parsed
 * AST so the caller can avoid an extra parse.
 *
 * Implementation: single `walk(program, ...)` that handles both passes.
 * When the walker enters a `component$()` CallExpression we synchronously
 * scan its arrow body's top-level statements for flattenable decls,
 * record them, and overwrite each decl's pattern range immediately.
 * The walker then descends into the body where identifier references
 * are rewritten against the flat `decls` array. DFS order guarantees
 * an identifier's enclosing-scope decls are collected before the
 * identifier itself is visited.
 */
type Substitution = { from: string; to: string };

export function flattenDestructureUseCalls(
  source: string,
  relPath: string,
  program: AstProgram,
): { source: string; changed: boolean } {
  // Sound textual prefilter: the walk below only acts on CallExpressions
  // whose callee Identifier is *literally* named `component$` (see the
  // name check in the enter handler — renamed imports never flatten).
  // An Identifier's name appears verbatim at its source position, so a
  // module whose text lacks the token cannot contain a trigger call;
  // skipping the walk entirely cannot change behavior. Over-inclusion
  // (the token inside a string or longer name) just falls through to
  // the walk, which decides for real.
  if (!source.includes('component$')) {
    return { source, changed: false };
  }

  // Lazy: even prefiltered modules usually have no flattenable decls,
  // and MagicString construction walks the whole source. Materialize on
  // the first overwrite.
  let s: MagicString | undefined;
  const edits = (): MagicString => (s ??= new MagicString(source));
  const decls: FlattenableDecl[] = [];
  const subsByScope = new Map<number, Substitution[]>();

  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      // Collect decls when entering a `component$()` CallExpression and
      // overwrite each decl's pattern range immediately so by the time
      // the walker descends into the body, the substitution map for the
      // enclosing scope is already populated. Manual one-level-deep body
      // iteration matches the pre-merge behavior (we do not piggyback
      // on the walker's VariableDeclaration visits — that would also
      // pick up nested function-body decls we don't want to flatten).
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
      // Skip identifiers that fall inside ANY flattened decl's pattern
      // range — those ranges were overwritten when the decl was
      // collected, and magic-string will throw if we try to split a
      // chunk that has already been edited. The walker visits inner
      // Identifier nodes of shorthand-Property destructures (`{url}`
      // → both the key and value sides resolve to the same Identifier),
      // and those value-side Identifiers don't match
      // `isDeclaringIdentifierPosition`'s key-equality check.
      for (const d of decls) {
        if (node.start >= d.idStart && node.end <= d.idEnd) return;
      }
      // First scope match (in source order — outermost-wins) governs
      // the substitution choice. Preserves pre-merge semantics exactly.
      for (const decl of decls) {
        if (node.start < decl.scopeStart || node.end > decl.scopeEnd) continue;
        const subs = subsByScope.get(decl.scopeStart);
        if (!subs) continue;
        const hit = subs.find(sub => sub.from === node.name);
        if (!hit) continue;
        edits().overwrite(node.start, node.end, hit.to);
        return;
      }
    },
  });

  if (s === undefined || !s.hasChanged()) return { source, changed: false };
  return { source: s.toString(), changed: true };
}

/**
 * True when an Identifier node sits in a *declaring* position rather than
 * a reference position — i.e. it's introducing a binding, naming an object
 * literal key, labelling a statement, etc. References to flattened
 * destructured names need to be rewritten; declaring positions don't.
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

interface FlattenableDecl {
  /** Source position of the declarator's `id` (the destructure pattern). */
  idStart: number;
  idEnd: number;
  /** Source position of the enclosing function body — the substitution scope. */
  scopeStart: number;
  scopeEnd: number;
  /** Source position of the variable declaration's surrounding statement. */
  declStart: number;
  declEnd: number;
  newBinding: string;
  fields: Array<{ localName: string; keyName: string }>;
}

/**
 * Inspect a single `component$(arrow)` call. For each flattenable
 * `const { ... } = use*()` declaration at the top level of the arrow's
 * body, record a FlattenableDecl, overwrite the pattern range, and
 * register the substitution map under the body's source span.
 *
 * Only `component$()` calls whose first argument is an arrow with a
 * BlockStatement body produce output here — other shapes are silently
 * ignored. Manual one-level-deep iteration of `body.body` matches the
 * pre-merge collection behavior and avoids picking up nested
 * VariableDeclarations the walker would otherwise visit.
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
    // Skip the well-known marker hooks — the qrl rewrite re-targets
    // these and the destructure here would interact awkwardly.
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

/** Convenience: parse, flatten, re-parse. Used in Phase 0.5 of
 * `transformModule`. */
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
