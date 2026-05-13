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
import { parseWithRawTransfer } from './parse.js';
import { walk } from 'oxc-walker';
import type { AstNode, AstParentNode, AstProgram } from '../../ast-types.js';

/**
 * Apply destructure flattening to a source string. Returns the rewritten
 * source (or the original if nothing changed) along with the re-parsed
 * AST so the caller can avoid an extra parse.
 */
export function flattenDestructureUseCalls(
  source: string,
  relPath: string,
  program: AstProgram,
): { source: string; changed: boolean } {
  const decls = collectFlattenableDecls(program);
  if (decls.length === 0) return { source, changed: false };

  const s = new MagicString(source);

  // First pass: rewrite each `const {x,y} = use*()` declaration to
  // `const flat = use*();` and record the substitution map per scope.
  type Substitution = { from: string; to: string };
  const subsByScope = new Map<number, Substitution[]>();
  for (const decl of decls) {
    const subs: Substitution[] = [];
    for (const field of decl.fields) {
      subs.push({ from: field.localName, to: `${decl.newBinding}.${field.keyName}` });
    }
    s.overwrite(decl.idStart, decl.idEnd, decl.newBinding);
    const existing = subsByScope.get(decl.scopeStart) ?? [];
    subsByScope.set(decl.scopeStart, [...existing, ...subs]);
  }

  // Second pass: walk all identifier references inside each enclosing
  // scope and rewrite shorthand uses of the destructured names to
  // member access on the flattened binding. We use `walk` again on the
  // ORIGINAL program AST since identifier positions still match the
  // pre-overwrite source (overwrites are at decl-pattern positions,
  // which are disjoint from reference positions).
  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      if (node.type !== 'Identifier' || !node.name) return;
      if (isDeclaringIdentifierPosition(node, parent)) return;
      // Skip identifiers that fall inside ANY flattened decl's pattern
      // range — those ranges were overwritten by the first pass, and
      // magic-string will throw if we try to split a chunk that has
      // already been edited. The walker visits inner Identifier nodes
      // of shorthand-Property destructures (`{url}` → both the key
      // and value sides resolve to the same Identifier), and those
      // value-side Identifiers don't match `isDeclaringIdentifier
      // Position`'s key-equality check.
      for (const d of decls) {
        if (node.start >= d.idStart && node.end <= d.idEnd) return;
      }
      // Find the innermost enclosing scope substitution set, if any.
      for (const decl of decls) {
        if (node.start < decl.scopeStart || node.end > decl.scopeEnd) continue;
        const subs = subsByScope.get(decl.scopeStart);
        if (!subs) continue;
        const hit = subs.find(sub => sub.from === node.name);
        if (!hit) continue;
        s.overwrite(node.start, node.end, hit.to);
        return;
      }
    },
  });

  if (!s.hasChanged()) return { source, changed: false };
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

function collectFlattenableDecls(program: AstProgram): FlattenableDecl[] {
  const decls: FlattenableDecl[] = [];

  walk(program, {
    enter(node: AstNode) {
      // Only flatten inside an arrow body that's the first arg of a
      // `component$()` call. Other contexts (top-level module body,
      // hook bodies, etc.) don't apply the transform in SWC — gating
      // here keeps blast radius narrow.
      if (
        node.type !== 'CallExpression' ||
        node.callee?.type !== 'Identifier' ||
        node.callee.name !== 'component$'
      ) return;
      const arrow = node.arguments?.[0];
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
        decls.push({
          idStart: id.start,
          idEnd: id.end,
          scopeStart,
          scopeEnd,
          declStart: stmt.start,
          declEnd: stmt.end,
          newBinding,
          fields,
        });
      }
    },
  });

  return decls;
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
