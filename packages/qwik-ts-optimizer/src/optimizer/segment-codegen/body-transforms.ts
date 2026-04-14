/**
 * Segment body transformation helpers for the Qwik optimizer.
 *
 * Contains nested call site rewriting, .w() hoisting, enum inlining,
 * raw props application, sync$ transformation, diagnostic stripping,
 * dead code elimination, and function signature rewriting.
 */

import { createRegExp, exactly, oneOrMore, maybe, anyOf, wordChar, wordBoundary, whitespace, charNotIn, global } from 'magic-regexp';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import type {
  AstNode,
  AstParseResult,
} from '../../ast-types.js';
import { parseWithRawTransfer } from '../utils/parse.js';
import { buildSyncTransform, needsPureAnnotation } from '../rewrite-calls.js';
import { applyRawPropsTransform, consolidateRawPropsInWCalls } from '../rewrite/index.js';
import type { ExtractionResult } from '../extract.js';
import type { NestedCallSiteInfo } from '../segment-codegen.js';
import {
  findArrowIndex,
  scanMatchingParenForward,
  scanMatchingParenBackward,
} from '../utils/text-scanning.js';

const qwikDisableDirective = createRegExp(
  exactly('/*').and(whitespace.times.any()).and('@qwik-disable-next-line')
    .and(oneOrMore(whitespace)).and(oneOrMore(wordChar))
    .and(whitespace.times.any()).and('*/').and(whitespace.times.any()).and(maybe(exactly('\n'))),
  [global],
);

const funcSignaturePattern = createRegExp(
  whitespace.times.any().and('function').and(whitespace.times.any()).and(wordChar.times.any()).and(whitespace.times.any()).grouped()
    .and('(').and(charNotIn(')').times.any().grouped()).and(')').at.lineStart(),
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
      const propValueRef = site.hoistedSymbolName ?? site.qrlVarName;
      const relStart = site.attrStart - bodyOffset;
      const relEnd = site.attrEnd - bodyOffset;
      if (relStart >= 0 && relEnd <= bodyText.length) {
        bodyText = bodyText.slice(0, relStart) +
          `${site.transformedPropName}={${propValueRef}}` +
          bodyText.slice(relEnd);
      }

      if (site.hoistedSymbolName && site.hoistedCaptureNames && site.hoistedCaptureNames.length > 0) {
        const capturedVar = site.hoistedCaptureNames[0];
        const enclosingPos = findEnclosingArrowBodyForCapture(bodyText, relStart, capturedVar);
        // Top-level function body (< 20 chars from start) means component-scoped captures
        const isLoopCallback = enclosingPos >= 0 && enclosingPos > 20;
        if (isLoopCallback) {
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
          const captureList = site.hoistedCaptureNames.join(',\n        ');
          const decl = `const ${site.hoistedSymbolName} = ${site.qrlVarName}.w([\n        ${captureList}\n    ]);`;
          componentScopeWDecls.push(decl);
        }
      }
    } else {
      const relStart = site.callStart - bodyOffset;
      const relEnd = site.callEnd - bodyOffset;
      if (relStart >= 0 && relEnd <= bodyText.length) {
        let qrlRef = site.qrlVarName;
        if (site.captureNames && site.captureNames.length > 0) {
          qrlRef += '.w([\n        ' + site.captureNames.join(',\n        ') + '\n    ])';
        }
        if (site.qrlCallee) {
          const purePrefix = needsPureAnnotation(site.qrlCallee) ? '/*#__PURE__*/ ' : '';
          bodyText = bodyText.slice(0, relStart) + `${purePrefix}${site.qrlCallee}(${qrlRef})` + bodyText.slice(relEnd);
        } else {
          bodyText = bodyText.slice(0, relStart) + qrlRef + bodyText.slice(relEnd);
        }
      }
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

/** Inject component-scope .w() declarations before the return statement. */
function injectComponentScopeWDecls(bodyText: string, decls: string[] | undefined): string {
  if (!decls || decls.length === 0) return bodyText;

  const returnIdx = bodyText.indexOf('return ');
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

/** Apply _rawProps transform for component$ segments, add _restProps import if needed. */
export function applyRawPropsIfComponent(
  bodyText: string,
  extraction: ExtractionResult,
  parts: string[],
): string {
  const isComponentSegment = extraction.ctxName === 'component$' || extraction.ctxName === 'componentQrl';
  if (!isComponentSegment) return bodyText;

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
  const paramList = paramNames.join(', ');

  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx !== -1) {
    let parenEnd = arrowIdx - 1;
    while (parenEnd >= 0 && /\s/.test(bodyText[parenEnd])) parenEnd--;

    if (bodyText[parenEnd] === ')') {
      const parenStart = scanMatchingParenBackward(bodyText, parenEnd - 1);
      return bodyText.slice(0, parenStart + 1) + paramList + bodyText.slice(parenEnd);
    }

    // Single param without parens
    let identStart = parenEnd;
    while (identStart > 0 && /\w/.test(bodyText[identStart - 1])) identStart--;
    return bodyText.slice(0, identStart) + '(' + paramList + ')' + bodyText.slice(parenEnd + 1);
  }

  const funcMatch = bodyText.match(funcSignaturePattern);
  if (funcMatch) {
    return funcMatch[1]! + '(' + paramList + ')' + bodyText.slice(funcMatch[0]!.length);
  }

  return bodyText;
}

/**
 * Inject _captures unpacking into a function body text.
 */
export function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string {
  if (captureNames.length === 0) return bodyText;

  const unpackParts = captureNames.map((name, i) => `${name} = _captures[${i}]`);
  const unpackLine = `const ${unpackParts.join(', ')};`;

  const arrowIdx = findArrowIndex(bodyText);
  if (arrowIdx === -1) return injectIntoBlockBody(bodyText, unpackLine);

  let afterArrow = arrowIdx + 2;
  while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow])) {
    afterArrow++;
  }

  if (bodyText[afterArrow] === '{') {
    return bodyText.slice(0, afterArrow + 1) + '\n' + unpackLine + bodyText.slice(afterArrow + 1);
  }

  // Expression body: convert to block body with return
  const expr = bodyText.slice(afterArrow);
  const prefix = bodyText.slice(0, arrowIdx + 2);
  return prefix + ' {\n' + unpackLine + '\nreturn ' + expr + ';\n}';
}

export { findArrowIndex };

function injectIntoBlockBody(bodyText: string, line: string): string {
  const braceIdx = bodyText.indexOf('{');
  if (braceIdx === -1) return bodyText;
  return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
}

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
