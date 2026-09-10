/**
 * Lib-mode emission collapse.
 *
 * Post-pass that runs on the assembled inline-strategy output and collapses the three-statement
 * triple
 *
 * Const q_X = _noopQrl("X"); const X_BODY = (...args) => { ...body... }; q_X.s(X_BODY);
 *
 * (plus any `q_X` / `q_X.w([captures])` references in the parent module body) into a single inlined
 * `inlinedQrl(body, "X", [captures])` literal at every reference site. The decls + `.s()` call
 * disappear.
 *
 * Used when `RewriteContext.isLibMode` is true. Re-uses the inline-strategy machinery for body
 * emission + capture wiring (extraction, capture analysis, `q_X.s(body)` synthesis); only the final
 * emission shape differs.
 *
 * Emits library-mode form:
 *
 * Export const Works = componentQrl(inlinedQrl((props) => { useStyleQrl(inlinedQrl(STYLES,
 * "Works_component_useStyle_...")); ... useTaskQrl(inlinedQrl(() => { ... }, "Works_...", [sig]));
 * ... }, "Works_component_..."));
 *
 * Bodies are substituted bottom-up: each q_X's body has inner q_Y references replaced first, so the
 * outer literal already contains the collapsed inner ones.
 *
 * Import side: removes `_noopQrl`, adds `inlinedQrl`; `_captures` stays.
 */

import MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import { parseWithRawTransfer } from '../ast/parse.js';
import type { AstNode, AstProgram, CallExpression } from '../../ast-types.js';
import { createTransformSession } from '../edit/transform-session.js';

interface NoopQrlDecl {
  readonly qVarName: string;
  readonly qrlSymbolName: string;
  readonly start: number;
  readonly end: number;
}

interface SCallStatement {
  readonly qVarName: string;
  readonly bodyText: string;
  readonly start: number;
  readonly end: number;
  readonly bodyDecl?: { name: string; start: number; end: number };
}

/**
 * Collapse the inline-strategy output into lib-mode emit shape. Returns the source unchanged when
 * no `_noopQrl(...)` decls are found.
 */
export function collapseToLibInlinedQrl(source: string): string {
  // JSX is already lowered by this point, so parse as .ts first — in .tsx a
  // generic arrow like `<T>(x: T) => x` is a JSX ambiguity and fails to parse.
  let parsed = parseWithRawTransfer('lib-collapse.ts', source);
  if (!parsed.program || parsed.errors?.length) {
    parsed = parseWithRawTransfer('lib-collapse.tsx', source);
  }
  if (!parsed.program || parsed.errors?.length) {
    return source;
  }
  const program = parsed.program as AstProgram;

  const noopDecls = collectNoopQrlDecls(program, source);
  if (noopDecls.size === 0) {
    return source;
  }

  const sCalls = collectSCallStatements(program, source, noopDecls);
  if (sCalls.size === 0) {
    return source;
  }

  const inlinedLiteralsByVar = new Map<string, string>();
  const inProgress = new Set<string>();
  function buildInlinedLiteral(qVar: string): string | null {
    const cached = inlinedLiteralsByVar.get(qVar);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(qVar)) {
      return null;
    }
    const decl = noopDecls.get(qVar);
    const sCall = sCalls.get(qVar);
    if (!decl || !sCall) {
      return null;
    }
    inProgress.add(qVar);
    const collapsedBody = substituteInnerQVarsInText(sCall.bodyText, buildInlinedLiteral);
    inProgress.delete(qVar);
    // Bare form; the reference site appends the captures array when it sees `.w([...])`.
    const literal = `/*#__PURE__*/ inlinedQrl(${collapsedBody}, "${decl.qrlSymbolName}")`;
    inlinedLiteralsByVar.set(qVar, literal);
    return literal;
  }

  // Pre-build all literals so the body strings are settled before applying edits.
  for (const qVar of noopDecls.keys()) {
    if (sCalls.has(qVar)) {
      buildInlinedLiteral(qVar);
    }
  }
  if (inlinedLiteralsByVar.size === 0) {
    return source;
  }

  const edits = new MagicString(source);

  // Skip references inside noop-decl init or the body decls being deleted —
  // those are folded into the body strings via `substituteInnerQVarsInText`.
  const skipRanges = collectSkipRanges(noopDecls, sCalls);
  const referenceRanges = collectQVarReferenceRanges(
    program,
    source,
    inlinedLiteralsByVar,
    skipRanges
  );
  for (const ref of referenceRanges) {
    const literal = inlinedLiteralsByVar.get(ref.qVar)!;
    const replacement =
      ref.captureArgsText !== undefined
        ? insertCapturesIntoInlinedQrl(literal, ref.captureArgsText)
        : literal;
    edits.overwrite(ref.start, ref.end, replacement);
  }

  const ranges: Array<{ start: number; end: number }> = [];
  for (const decl of noopDecls.values()) {
    if (!inlinedLiteralsByVar.has(decl.qVarName)) {
      continue;
    }
    ranges.push({ start: decl.start, end: decl.end });
  }
  for (const sCall of sCalls.values()) {
    if (!inlinedLiteralsByVar.has(sCall.qVarName)) {
      continue;
    }
    ranges.push({ start: sCall.start, end: sCall.end });
    if (sCall.bodyDecl) {
      ranges.push({ start: sCall.bodyDecl.start, end: sCall.bodyDecl.end });
    }
  }
  ranges.sort((a, b) => b.start - a.start);
  for (const r of ranges) {
    edits.remove(r.start, r.end);
  }

  rewriteImports(edits, source);

  return edits.toString();
}

/**
 * Substitute inner `q_Y`/`q_Y.w([...])` references in `bodyText` with their collapsed inlinedQrl
 * literals.
 */
function substituteInnerQVarsInText(
  bodyText: string,
  buildInlinedLiteral: (qVar: string) => string | null
): string {
  const session = createTransformSession(bodyText);
  if (!session) {
    return bodyText;
  }

  const edits = session.edits;
  const wrappedSource = session.wrappedSource;
  const decl = (session.program.body[0] as { declarations?: Array<{ init?: AstNode }> })
    ?.declarations?.[0];
  const bodyNode = decl?.init;
  if (!bodyNode) {
    return bodyText;
  }

  walk(bodyNode, {
    enter(node: AstNode) {
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object?.type === 'Identifier' &&
        node.callee.property?.type === 'Identifier' &&
        node.callee.property.name === 'w'
      ) {
        const literal = buildInlinedLiteral(node.callee.object.name);
        if (literal) {
          const captureArg = node.arguments?.[0];
          const captureText =
            captureArg && captureArg.type !== 'SpreadElement'
              ? wrappedSource.slice(captureArg.start, captureArg.end)
              : undefined;
          const replacement =
            captureText === undefined
              ? literal
              : insertCapturesIntoInlinedQrl(literal, captureText);
          edits.overwrite(node.start, node.end, replacement);
          this.skip();
        }
        return;
      }

      if (node.type === 'Identifier') {
        const literal = buildInlinedLiteral(node.name);
        if (literal) {
          edits.overwrite(node.start, node.end, literal);
          this.skip();
        }
      }
    },
  });

  return session.toSource();
}

function insertCapturesIntoInlinedQrl(literal: string, captureArgsText: string): string {
  const lastParen = literal.lastIndexOf(')');
  if (lastParen < 0) {
    return literal;
  }
  return literal.slice(0, lastParen) + `, ${captureArgsText}` + literal.slice(lastParen);
}

function unwrapNoopQrlCall(node: AstNode): CallExpression | null {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === '_noopQrl'
  ) {
    return node;
  }
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'm' &&
    node.callee.object.type === 'CallExpression'
  ) {
    return unwrapNoopQrlCall(node.callee.object);
  }
  return null;
}

function collectNoopQrlDecls(program: AstProgram, source: string): Map<string, NoopQrlDecl> {
  const out = new Map<string, NoopQrlDecl>();
  for (const stmt of program.body ?? []) {
    if (stmt.type !== 'VariableDeclaration') {
      continue;
    }
    if (stmt.declarations?.length !== 1) {
      continue;
    }
    const decl = stmt.declarations[0];
    if (!decl.id || decl.id.type !== 'Identifier') {
      continue;
    }
    if (!decl.init) {
      continue;
    }
    const noopQrlCall = unwrapNoopQrlCall(decl.init);
    if (!noopQrlCall) {
      continue;
    }
    const args = noopQrlCall.arguments ?? [];
    if (args.length < 1) {
      continue;
    }
    const nameArg = args[0];
    if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') {
      continue;
    }
    out.set(decl.id.name, {
      qVarName: decl.id.name,
      qrlSymbolName: nameArg.value,
      start: stmt.start,
      end: includeTrailingNewline(source, stmt.end),
    });
  }
  return out;
}

function collectSCallStatements(
  program: AstProgram,
  source: string,
  noopDecls: Map<string, NoopQrlDecl>
): Map<string, SCallStatement> {
  const constDeclByName = new Map<
    string,
    { name: string; bodyText: string; start: number; end: number }
  >();
  for (const stmt of program.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') {
      continue;
    }
    if (stmt.declarations?.length !== 1) {
      continue;
    }
    const decl = stmt.declarations[0];
    if (!decl.id || decl.id.type !== 'Identifier') {
      continue;
    }
    if (!decl.init) {
      continue;
    }
    if (unwrapNoopQrlCall(decl.init)) {
      continue;
    }
    constDeclByName.set(decl.id.name, {
      name: decl.id.name,
      bodyText: source.slice(decl.init.start, decl.init.end),
      start: stmt.start,
      end: includeTrailingNewline(source, stmt.end),
    });
  }

  const out = new Map<string, SCallStatement>();
  for (const stmt of program.body ?? []) {
    if (stmt.type !== 'ExpressionStatement') {
      continue;
    }
    const expr = stmt.expression;
    if (!expr || expr.type !== 'CallExpression') {
      continue;
    }
    const callee = expr.callee;
    if (
      !callee ||
      callee.type !== 'MemberExpression' ||
      callee.computed ||
      callee.object?.type !== 'Identifier' ||
      callee.property?.type !== 'Identifier' ||
      callee.property.name !== 's'
    ) {
      continue;
    }
    const qVarName = callee.object.name;
    if (!noopDecls.has(qVarName)) {
      continue;
    }
    const args = expr.arguments ?? [];
    if (args.length !== 1) {
      continue;
    }
    const bodyArg = args[0];
    if (!bodyArg || bodyArg.type === 'SpreadElement') {
      continue;
    }

    let bodyText: string;
    let bodyDecl: SCallStatement['bodyDecl'];
    if (bodyArg.type === 'Identifier') {
      // Two cases: (1) synthesized body var `q_X.s(X)` where `X` matches the qrl
      // symbol name — resolve to its init text and delete the decl; (2) user
      // binding `q_X.s(STYLES)` — keep the identifier and preserve the decl.
      const decl = constDeclByName.get(bodyArg.name);
      const noopDecl = noopDecls.get(qVarName);
      const isSyntheticBody =
        decl != null && noopDecl != null && bodyArg.name === noopDecl.qrlSymbolName;
      if (isSyntheticBody && decl) {
        bodyText = decl.bodyText;
        bodyDecl = { name: decl.name, start: decl.start, end: decl.end };
      } else {
        bodyText = source.slice(bodyArg.start, bodyArg.end);
      }
    } else {
      bodyText = source.slice(bodyArg.start, bodyArg.end);
    }
    out.set(qVarName, {
      qVarName,
      bodyText,
      start: stmt.start,
      end: includeTrailingNewline(source, stmt.end),
      bodyDecl,
    });
  }
  return out;
}

interface QVarReferenceRange {
  readonly qVar: string;
  readonly start: number;
  readonly end: number;
  readonly captureArgsText?: string;
}

/**
 * Ranges to skip when walking for q_X references — the decls/statements deleted or replaced by
 * separate codepaths.
 */
function collectSkipRanges(
  noopDecls: Map<string, NoopQrlDecl>,
  sCalls: Map<string, SCallStatement>
): readonly { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const decl of noopDecls.values()) {
    out.push({ start: decl.start, end: decl.end });
  }
  for (const sCall of sCalls.values()) {
    out.push({ start: sCall.start, end: sCall.end });
    if (sCall.bodyDecl) {
      out.push({ start: sCall.bodyDecl.start, end: sCall.bodyDecl.end });
    }
  }
  return out;
}

function isInsideAnyRange(pos: number, ranges: readonly { start: number; end: number }[]): boolean {
  for (const r of ranges) {
    if (pos >= r.start && pos < r.end) {
      return true;
    }
  }
  return false;
}

function collectQVarReferenceRanges(
  program: AstProgram,
  source: string,
  buildersByVar: ReadonlyMap<string, string>,
  skipRanges: readonly { start: number; end: number }[]
): readonly QVarReferenceRange[] {
  const out: QVarReferenceRange[] = [];

  walk(program, {
    enter(node: AstNode) {
      if (isInsideAnyRange(node.start, skipRanges)) {
        this.skip();
        return;
      }

      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object?.type === 'Identifier' &&
        node.callee.property?.type === 'Identifier' &&
        node.callee.property.name === 'w' &&
        buildersByVar.has(node.callee.object.name)
      ) {
        const arg = node.arguments?.[0];
        if (node.arguments?.length === 1 && arg) {
          out.push({
            qVar: node.callee.object.name,
            start: node.start,
            end: node.end,
            captureArgsText:
              arg.type === 'SpreadElement' ? undefined : source.slice(arg.start, arg.end),
          });
          this.skip();
        }
        return;
      }

      if (node.type === 'Identifier' && buildersByVar.has(node.name)) {
        out.push({ qVar: node.name, start: node.start, end: node.end });
        this.skip();
      }
    },
  });
  return out;
}

function rewriteImports(edits: MagicString, source: string): void {
  const noopImportRe = /import\s*\{\s*_noopQrl\s*\}\s*from\s*(["'])@qwik\.dev\/core\1\s*;\s*\n?/g;
  const match = noopImportRe.exec(source);
  if (match) {
    edits.overwrite(
      match.index,
      match.index + match[0].length,
      `import { inlinedQrl } from "@qwik.dev/core";\n`
    );
  }
}

function includeTrailingNewline(source: string, end: number): number {
  return end < source.length && source[end] === '\n' ? end + 1 : end;
}
