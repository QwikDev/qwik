/**
 * Segment body transformation helpers for the Qwik optimizer.
 *
 * Contains nested call site rewriting, .w() hoisting, enum inlining,
 * raw props application, sync$ transformation, diagnostic stripping,
 * dead code elimination, and function signature rewriting.
 */

import { createRegExp, exactly, oneOrMore, maybe, anyOf, wordChar, wordBoundary, whitespace, global } from 'magic-regexp';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import type {
  AstNode,
  AstParseResult,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../ast/parse.js';
import {
  createFunctionTransformSession,
  insertFunctionBodyPrologue,
  replaceFunctionParams,
} from '../edit/transform-session.js';
import { buildSyncTransform, needsPureAnnotation } from '../rewrite/rewrite-calls.js';
import { formatWCall } from '../qwik/w-call.js';
import { applyRawPropsTransform, consolidateRawPropsInWCalls } from '../rewrite/index.js';
import type { ExtractionResult } from '../extraction/extract.js';
import type { NestedCallSiteInfo } from './segment-codegen.js';
import {
  findArrowIndex,
  pureAwareOverwriteStart,
  scanMatchingParenForward,
} from '../edit/text-scanning.js';

const qwikDisableDirective = createRegExp(
  exactly('/*').and(whitespace.times.any()).and('@qwik-disable-next-line')
    .and(oneOrMore(whitespace)).and(oneOrMore(wordChar))
    .and(whitespace.times.any()).and('*/').and(whitespace.times.any()).and(maybe(exactly('\n'))),
  [global],
);

function getNestedCallSiteStart(site: NestedCallSiteInfo): number {
  if (!site.isJsxAttr) {
    return site.callStart;
  }
  return site.attrStart ?? site.callStart;
}

/**
 * Scan backwards from `pos` to find an enclosing arrow whose parameter list
 * includes `capturedVarName`, returning the injection position inside the body.
 *
 * Text-based because it runs after nested call site rewriting has invalidated
 * the original AST positions.
 */
function findEnclosingArrowBodyForCapture(text: string, pos: number, capturedVarName: string): number {
  let i = pos - 1;
  while (i >= 1) {
    if (text[i] !== '(' && text[i] !== '{') { i--; continue; }

    let j = i - 1;
    while (j >= 0 && /\s/.test(text[j])) j--;
    if (!(j >= 1 && text[j] === '>' && text[j - 1] === '=')) { i--; continue; }

    // Found `=> (` or `=> {` -- extract the parameter list
    let paramEnd = j - 2;
    while (paramEnd >= 0 && /\s/.test(text[paramEnd])) paramEnd--;

    let paramText = '';
    if (text[paramEnd] === ')') {
      let depth = 1;
      let pStart = paramEnd - 1;
      while (pStart >= 0 && depth > 0) {
        if (text[pStart] === ')') depth++;
        else if (text[pStart] === '(') depth--;
        pStart--;
      }
      pStart++;
      paramText = text.slice(pStart + 1, paramEnd);
    } else if (/\w/.test(text[paramEnd])) {
      let pStart = paramEnd;
      while (pStart > 0 && /\w/.test(text[pStart - 1])) pStart--;
      paramText = text.slice(pStart, paramEnd + 1);
    }

    const params = paramText.split(',').map(p => p.trim());
    if (params.includes(capturedVarName)) return i + 1;

    // Check if the captured variable is declared as a local inside this arrow body
    const bodyStart = i + 1;
    const bodySlice = text.slice(bodyStart, pos);
    const localDeclPattern = createRegExp(wordBoundary, anyOf('const', 'let', 'var'), oneOrMore(whitespace), exactly(capturedVarName), wordBoundary);
    if (localDeclPattern.test(bodySlice)) return bodyStart;

    i--;
  }
  return -1;
}

/**
 * Find the end position (after the semicolon) of a variable declaration
 * for the given variable name, searching forward from startPos.
 */
function findVarDeclarationEnd(text: string, startPos: number, varName: string): number {
  const pattern = createRegExp(wordBoundary, anyOf('const', 'let', 'var'), oneOrMore(whitespace), exactly(varName), whitespace.times.any(), exactly('='));
  const searchText = text.slice(startPos);
  const match = pattern.exec(searchText);
  if (!match) return -1;

  const declStart = startPos + match.index;
  const semiIdx = text.indexOf(';', declStart + match[0].length);
  if (semiIdx < 0) return -1;

  let endPos = semiIdx + 1;
  if (text[endPos] === '\n') endPos++;
  return endPos;
}

/**
 * Threshold separating "outermost arrow body" from "nested loop callback"
 * by the position `findEnclosingArrowBodyForCapture` returns.
 *
 * When that helper lands inside the segment body's outermost arrow
 * (e.g., the `(props) => {...}` that wraps the whole segment), the
 * returned position is small — within ~10 chars of `bodyText[0]`.
 * Anything deeper, like an `arr.map(item => {...})` callback nested
 * inside, gives a much larger position. Captures resolved at the
 * outermost level go to component scope (before the return); captures
 * resolved inside a nested callback get hoisted at the local declaration
 * site instead.
 *
 * 20 is empirical, tuned against the SWC reference output. A future
 * structural replacement (e.g., counting `=>` tokens before
 * `enclosingPos` or tracking scope depth during AST walking) would
 * need careful re-validation against the snapshot suite before
 * swapping in.
 */
const OUTERMOST_BODY_THRESHOLD = 20;

/**
 * Replace `bodyText[start, end)` with `replacement`. Returns the body
 * unchanged when the range is out of bounds — defensive guard against
 * stale positions from upstream rewriting.
 */
function spliceWithinBody(bodyText: string, start: number, end: number, replacement: string): string {
  if (start < 0 || end > bodyText.length) return bodyText;
  return bodyText.slice(0, start) + replacement + bodyText.slice(end);
}

/**
 * Rewrite nested $() calls and $-suffixed JSX attrs in the body text,
 * replacing them with QRL variable references. Returns the modified body text.
 *
 * MUST run before any other text modifications because it uses original source positions.
 */
export function rewriteNestedCallSitesInline(
  bodyText: string,
  nestedCallSites: NestedCallSiteInfo[],
  bodyOffset: number,
): string {
  const sorted = [...nestedCallSites].sort((a, b) => {
    return getNestedCallSiteStart(b) - getNestedCallSiteStart(a);
  });

  let componentScopeWDecls: string[] | undefined;
  const hoistDeclarations: Array<{ position: number; declaration: string }> = [];

  for (const site of sorted) {
    if (site.isJsxAttr && site.attrStart !== undefined && site.attrEnd !== undefined && site.transformedPropName) {
      // A JSX-attr child segment that captures variables but isn't
      // subject to the loop-cross hoist path (`hoistedSymbolName` unset,
      // populated by `buildNestedCallSites` only for in-loop or
      // loop-iter-padded handlers) still needs `.w([captures])`
      // wrapping at the parent's prop call site. Mirrors the
      // inline-strategy path in `rewrite/inline-body.ts`.
      let propValueRef: string;
      if (site.hoistedSymbolName) {
        propValueRef = site.hoistedSymbolName;
      } else if (site.captureNames && site.captureNames.length > 0) {
        propValueRef = formatWCall(site.qrlVarName, site.captureNames, '        ', '    ');
      } else {
        propValueRef = site.qrlVarName;
      }
      const relStart = site.attrStart - bodyOffset;
      const relEnd = site.attrEnd - bodyOffset;
      bodyText = spliceWithinBody(bodyText, relStart, relEnd, `${site.transformedPropName}={${propValueRef}}`);

      if (site.hoistedSymbolName && site.hoistedCaptureNames && site.hoistedCaptureNames.length > 0) {
        const capturedVar = site.hoistedCaptureNames[0];
        const enclosingPos = findEnclosingArrowBodyForCapture(bodyText, relStart, capturedVar);
        const isLoopCallback = enclosingPos >= 0 && enclosingPos > OUTERMOST_BODY_THRESHOLD;
        if (isLoopCallback) {
          // Asymmetric indentation (12-space first item, 8-space rest+close)
          // matches the SWC reference output for this branch byte-for-byte.
          // Kept inline rather than going through formatWCall.
          const captureList = site.hoistedCaptureNames.join(',\n        ');
          const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n            ${captureList}\n        ]);`;
          let latestDeclPos = -1;
          for (const capVar of site.hoistedCaptureNames) {
            const varDeclPos = findVarDeclarationEnd(bodyText, enclosingPos, capVar);
            if (varDeclPos > latestDeclPos) latestDeclPos = varDeclPos;
          }
          hoistDeclarations.push({ position: latestDeclPos >= 0 ? latestDeclPos : enclosingPos, declaration: decl });
        } else {
          if (!componentScopeWDecls) componentScopeWDecls = [];
          const wCall = formatWCall(site.qrlVarName, site.hoistedCaptureNames, '        ', '    ');
          componentScopeWDecls.push(`const ${site.hoistedSymbolName} = ${wCall};`);
        }
      }
    } else {
      let relStart = site.callStart - bodyOffset;
      const relEnd = site.callEnd - bodyOffset;
      let qrlRef = site.qrlVarName;
      if (site.captureNames && site.captureNames.length > 0) {
        qrlRef = formatWCall(site.qrlVarName, site.captureNames, '        ', '    ');
      }
      let replacement: string;
      if (site.qrlCallee) {
        // Wrapped in a `*Qrl(…)` call — a preceding PURE annotation still
        // applies to the call, so leave it be (and re-emit our own if needed).
        replacement = `${needsPureAnnotation(site.qrlCallee) ? '/*#__PURE__*/ ' : ''}${site.qrlCallee}(${qrlRef})`;
      } else {
        // Replaced by a bare `q_<symbol>` identifier: consume a leading PURE
        // annotation so it isn't stranded before the identifier (a fatal
        // Rolldown INVALID_ANNOTATION once reflowed onto its own line).
        relStart = pureAwareOverwriteStart(bodyText, relStart);
        replacement = qrlRef;
      }
      bodyText = spliceWithinBody(bodyText, relStart, relEnd, replacement);
    }
  }

  bodyText = injectHoistDeclarations(bodyText, hoistDeclarations);
  bodyText = injectComponentScopeWDecls(bodyText, componentScopeWDecls);
  return bodyText;
}

/** Inject .w() hoisting declarations, converting expression bodies to block bodies as needed. */
function injectHoistDeclarations(
  bodyText: string,
  hoistDeclarations: Array<{ position: number; declaration: string }>,
): string {
  if (hoistDeclarations.length === 0) return bodyText;

  // SWC groups .w() declarations in the same scope together at the max position
  if (hoistDeclarations.length > 1) {
    const maxPos = Math.max(...hoistDeclarations.map(h => h.position));
    const minPos = Math.min(...hoistDeclarations.map(h => h.position));
    if (maxPos - minPos < 500) {
      for (const h of hoistDeclarations) h.position = maxPos;
    }
  }

  hoistDeclarations.sort((a, b) => b.position - a.position);
  for (const hoist of hoistDeclarations) {
    const pos = hoist.position;
    const charBefore = bodyText[pos - 1];
    if (charBefore === '(') {
      // Expression body: `=> (expr)` -- convert to block body
      let depth = 1;
      let closeIdx = pos;
      while (closeIdx < bodyText.length && depth > 0) {
        if (bodyText[closeIdx] === '(') depth++;
        else if (bodyText[closeIdx] === ')') depth--;
        closeIdx++;
      }
      closeIdx--;
      const exprContent = bodyText.slice(pos, closeIdx).replace(/^\s+/, '');
      const blockBody = `{\n        ${hoist.declaration}\n        return ${exprContent};\n    }`;
      bodyText = bodyText.slice(0, pos - 1) + blockBody + bodyText.slice(closeIdx + 1);
    } else if (charBefore === '{') {
      bodyText = bodyText.slice(0, pos) +
        '\n        ' + hoist.declaration +
        bodyText.slice(pos);
    } else {
      // Mid-block injection: detect indentation from the next non-empty line
      let indent = '\t';
      const nextNewline = bodyText.indexOf('\n', pos);
      if (nextNewline >= 0) {
        const nextLine = bodyText.slice(nextNewline + 1);
        const indentMatch = nextLine.match(/^(\s+)/);
        if (indentMatch) indent = indentMatch[1];
      }
      bodyText = bodyText.slice(0, pos) +
        indent + hoist.declaration + '\n' +
        bodyText.slice(pos);
    }
  }
  return bodyText;
}

/**
 * Find the position of the component-level `return ` keyword in `bodyText` —
 * the return statement at depth-1 relative to the body's outer `{...}`.
 *
 * Required because a component body may contain nested function
 * declarations (each with their own `return`), and `componentScopeWDecls`
 * must be injected BEFORE the COMPONENT's return, not the first nested
 * function's return. `indexOf('return ')` would find the wrong one.
 *
 * Returns the position of the LAST depth-1 `return ` token (the component's
 * own return — any inner-function returns sit at deeper depths and are
 * skipped). Falls back to -1 if no depth-1 return is found.
 */
function findComponentReturnPosition(bodyText: string): number {
  let i = 0;
  // Skip ahead to the first `{` — the body open.
  while (i < bodyText.length && bodyText[i] !== '{') i++;
  if (i >= bodyText.length) return -1;
  let depth = 1;
  i++;
  let lastDepth1Return = -1;
  while (i < bodyText.length) {
    const ch = bodyText[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 1 && bodyText.startsWith('return ', i)) {
      // Confirm `return ` is a keyword by checking the preceding char isn't
      // an identifier continuation (defensive — guards against e.g. `noreturn `
      // would never appear in TS output but cheap to check).
      const prev = i > 0 ? bodyText[i - 1] : '\n';
      if (!/[A-Za-z0-9_$]/.test(prev)) {
        lastDepth1Return = i;
      }
      i += 7;
      continue;
    }
    i++;
  }
  return lastDepth1Return;
}

/** Inject component-scope .w() declarations before the component's return statement. */
function injectComponentScopeWDecls(bodyText: string, decls: string[] | undefined): string {
  if (!decls || decls.length === 0) return bodyText;

  const returnIdx = findComponentReturnPosition(bodyText);
  if (returnIdx < 0) return bodyText;

  let lineStart = returnIdx - 1;
  while (lineStart >= 0 && bodyText[lineStart] !== '\n') lineStart--;
  const indent = bodyText.slice(lineStart + 1, returnIdx);
  const declBlock = decls.join('\n' + indent) + '\n' + indent;
  return bodyText.slice(0, returnIdx) + declBlock + bodyText.slice(returnIdx);
}

/** Inline TS enum member references (e.g., Thing.A -> 0). */
export function inlineEnumReferences(bodyText: string, enumValueMap: Map<string, Map<string, string>>): string {
  for (const [enumName, members] of enumValueMap) {
    for (const [memberName, value] of members) {
      const pattern = createRegExp(wordBoundary, exactly(enumName), exactly('.'), exactly(memberName), wordBoundary, [global]);
      bodyText = bodyText.replace(pattern, value);
    }
  }
  return bodyText;
}

/**
 * Apply `_ref` indirection for self-referential captures.
 *
 * When a component body declares `const X = call(q_yyy.w([X]))`, the capture
 * array references `X` inside its own initializer — TDZ. Rewrites to:
 *
 *     const _ref = {};
 *     _ref.X = call(q_yyy.w([_ref.X]));
 *     const { X } = _ref;
 *
 * Detection is conservative: only `q_xxx.w([...])` arrays are inspected for
 * Identifier elements matching the enclosing const declarator name.
 */
export function applySelfRefIndirection(bodyText: string): string {
  if (!bodyText.includes('.w([')) return bodyText;

  const session = createFunctionTransformSession('__sr__.tsx', bodyText, { wrapperPrefix: 'const __sr__ = ' });
  if (!session) return bodyText;
  const block = session.fn.body;
  if (!block || block.type !== 'BlockStatement') return bodyText;

  let foundAny = false;
  for (const stmt of block.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const' || stmt.declarations?.length !== 1) continue;
    const d = stmt.declarations[0];
    if (d?.id?.type !== 'Identifier' || !d.init) continue;
    const { name } = d.id;
    let referenced = false;
    walk(d.init, {
      enter(node: AstNode) {
        if (node.type !== 'CallExpression') return;
        // The parser emits 'MemberExpression' — never the Babel-style
        // 'StaticMemberExpression' shape.
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'w') return;
        if (callee.object.type !== 'Identifier' || !callee.object.name.startsWith('q_')) return;
        const arr = node.arguments[0];
        if (!arr || arr.type !== 'ArrayExpression') return;
        for (const el of arr.elements ?? []) {
          if (el?.type === 'Identifier' && el.name === name) {
            session.edits.overwrite(el.start, el.end, `_ref.${name}`);
            referenced = true;
          }
        }
      },
    });
    if (referenced) {
      foundAny = true;
      session.edits.overwrite(stmt.start, d.id.end, `_ref.${name}`);
      session.edits.appendRight(stmt.end, `\n    const { ${name} } = _ref;`);
    }
  }

  if (!foundAny) return bodyText;
  insertFunctionBodyPrologue(session, session.fn, '    const _ref = {};');
  return session.toSource();
}

/**
 * Normalise destructured first params to `_rawProps`, add `_restProps` import if needed.
 * Applies to any qrl segment with a destructured first param (component$ or otherwise) —
 * `applyRawPropsTransform` is a no-op when the first param isn't destructured.
 */
export function applyRawPropsToSegmentBody(bodyText: string, parts: string[]): string {
  const result = applyRawPropsTransform(bodyText);
  if (result === bodyText) return bodyText;

  bodyText = consolidateRawPropsInWCalls(result);
  if (bodyText.includes('_restProps(') && !parts.some(p => p.includes('_restProps'))) {
    insertImportBeforeSeparator(parts, `import { _restProps } from "@qwik.dev/core";`);
  }
  return bodyText;
}

/**
 * Strip diagnostic comments and passive/preventdefault JSX directives.
 * Must run AFTER nested call site rewriting (which uses original positions).
 */
export function stripDiagnosticsAndDirectives(bodyText: string): string {
  bodyText = bodyText.replace(qwikDisableDirective, '');

  // Strip passive:* and matching preventdefault:* PER-ELEMENT.
  // Matches HTML opening tags: `<tagName attrs>`. Uses lazy quantifier for attrs capture.
  // Not converted to magic-regexp: lazy quantifiers inside capture groups aren't supported.
  bodyText = bodyText.replace(/<(\w+)([^>]*?)>/g, (_match, tagName, attrsStr) => {
    const elementPassive = new Set<string>();
    for (const m of attrsStr.matchAll(/passive:(\w+)/g)) {
      elementPassive.add(m[1]);
    }
    let cleaned = attrsStr.replace(/\s*passive:\w+/g, '');
    if (elementPassive.size > 0) {
      cleaned = cleaned.replace(/\s*preventdefault:(\w+)/g, (pdFull: string, eventName: string) => {
        return elementPassive.has(eventName) ? '' : pdFull;
      });
    }
    return `<${tagName}${cleaned}>`;
  });

  return bodyText;
}

/** Transform sync$() calls to _qrlSync() with minified string argument. */
export function transformSyncCalls(bodyText: string, parts: string[]): string {
  if (!bodyText.includes('sync$(')) return bodyText;

  let result = '';
  let i = 0;
  while (i < bodyText.length) {
    const syncIdx = bodyText.indexOf('sync$(', i);
    if (syncIdx === -1) { result += bodyText.slice(i); break; }

    // Word boundary check
    if (syncIdx > 0 && /[\w$]/.test(bodyText[syncIdx - 1])) {
      result += bodyText.slice(i, syncIdx + 6);
      i = syncIdx + 6;
      continue;
    }

    result += bodyText.slice(i, syncIdx);
    const openParen = syncIdx + 5;
    const closePos = scanMatchingParenForward(bodyText, openParen + 1);
    result += buildSyncTransform(bodyText.slice(openParen + 1, closePos - 1));
    i = closePos;
  }

  bodyText = result;
  const syncSepIdx = parts.indexOf('//');
  if (syncSepIdx >= 0 && !parts.some(p => p.includes('_qrlSync'))) {
    parts.splice(syncSepIdx, 0, `import { _qrlSync } from "@qwik.dev/core";`);
  }
  return bodyText;
}

/** Add imports for core symbols referenced in body but not yet imported. */
export function ensureCoreImports(bodyText: string, parts: string[]): void {
  const coreSymbols = ['_jsxSorted', '_jsxSplit', '_fnSignal', '_wrapProp', '_restProps', '_getVarProps', '_getConstProps'];
  const sepIdx = parts.indexOf('//');
  if (sepIdx < 0) return;

  for (const sym of coreSymbols) {
    if (bodyText.includes(sym) && !parts.some(p => p.startsWith('import') && p.includes(sym))) {
      parts.splice(sepIdx, 0, `import { ${sym} } from "@qwik.dev/core";`);
    }
  }
  if (bodyText.includes('_Fragment') && !parts.some(p => p.startsWith('import') && p.includes('_Fragment'))) {
    parts.splice(parts.indexOf('//'), 0, `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`);
  }
}

/**
 * Remove `const X = literal;` declarations from a function body when X is
 * no longer referenced anywhere else in the body.
 */
export function removeDeadConstLiterals(bodyText: string): string {
  const wrapper = `const __dce__ = ${bodyText}`;
  let parsed: AstParseResult;
  try {
    parsed = parseWithRawTransfer('__dce__.tsx', wrapper);
  } catch {
    return bodyText;
  }
  if (!parsed?.program?.body?.[0]) return bodyText;

  const decl = parsed.program.body[0];
  if (decl.type !== 'VariableDeclaration') return bodyText;
  const init = decl.declarations?.[0]?.init;
  if (!init) return bodyText;

  let fnBody: AstNode | null = null;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    fnBody = init.body;
  }
  if (!fnBody || fnBody.type !== 'BlockStatement') return bodyText;

  const offset = 'const __dce__ = '.length;
  const stmts = fnBody.body;
  if (!stmts || stmts.length === 0) return bodyText;

  interface DeadCandidate {
    name: string;
    stmtStart: number;
    stmtEnd: number;
  }
  const candidates: DeadCandidate[] = [];

  for (const stmt of stmts) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    if (stmt.declarations.length !== 1) continue;
    const d = stmt.declarations[0];
    if (d.id?.type !== 'Identifier') continue;
    const initNode = d.init;
    if (!initNode) continue;
    const isLiteral =
      initNode.type === 'Literal' &&
      (initNode.value === null || typeof initNode.value !== 'object');
    if (!isLiteral) continue;

    candidates.push({ name: d.id.name, stmtStart: stmt.start - offset, stmtEnd: stmt.end - offset });
  }

  if (candidates.length === 0) return bodyText;

  const toRemove: DeadCandidate[] = [];
  for (const c of candidates) {
    const rest = bodyText.slice(0, c.stmtStart) + bodyText.slice(c.stmtEnd);
    const escaped = createRegExp(exactly(c.name)).source;
    const re = new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`);
    if (!re.test(rest)) toRemove.push(c);
  }

  if (toRemove.length === 0) return bodyText;

  toRemove.sort((a, b) => b.stmtStart - a.stmtStart);
  let result = bodyText;
  for (const c of toRemove) {
    let end = c.stmtEnd;
    while (end < result.length && (result[end] === '\n' || result[end] === '\r' || result[end] === ';')) end++;
    let start = c.stmtStart;
    while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) start--;
    result = result.slice(0, start) + result.slice(end);
  }

  return result;
}

/**
 * Rewrite a function's parameter list to use the given paramNames.
 */
export function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string {
  const session = createFunctionTransformSession('__sig__.tsx', bodyText, {
    wrapperPrefix: 'const __sig__ = ',
  });
  if (!session) return bodyText;
  if (!replaceFunctionParams(session, session.fn, paramNames)) return bodyText;
  return session.toSource();
}

/**
 * Inject _captures unpacking into a function body text.
 */
export function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string {
  if (captureNames.length === 0) return bodyText;

  const unpackParts = captureNames.map((name, i) => `${name} = _captures[${i}]`);
  const unpackLine = `const ${unpackParts.join(', ')};`;

  const session = createFunctionTransformSession('__captures__.tsx', bodyText, {
    wrapperPrefix: 'const __captures__ = ',
  });
  if (!session) return bodyText;

  insertFunctionBodyPrologue(session, session.fn, unpackLine);
  return session.toSource();
}

export { findArrowIndex };

export function insertImportBeforeSeparator(parts: string[], importStmt: string): void {
  const sepIdx = parts.indexOf('//');
  if (sepIdx < 0) {
    parts.unshift(importStmt);
    return;
  }
  parts.splice(sepIdx, 0, importStmt);
}

export function partsHaveImport(parts: string[], symbol: string): boolean {
  return parts.some(p =>
    p.includes(`{ ${symbol} }`) || p.includes(`{ ${symbol},`) ||
    p.includes(`, ${symbol} }`) || p.includes(`, ${symbol},`) ||
    p.includes(`as ${symbol}`) || p.includes(`* as ${symbol}`),
  );
}
