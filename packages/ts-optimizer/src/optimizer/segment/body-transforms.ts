import { walk } from 'oxc-walker';
import type { AstNode } from '../../ast-types.js';
import {
  createFunctionTransformSession,
  insertFunctionBodyPrologue,
  replaceFunctionParams,
  type FunctionTransformSession,
} from '../edit/transform-session.js';
import { buildSyncTransform, needsPureAnnotation } from '../rewrite/rewrite-calls.js';
import { formatWCall, parseArrayItems } from '../qwik/w-call.js';
import { insertLoopWDecls, type LoopWDecl } from '../jsx/loop-hoisting.js';
import { applyRawPropsTransform, consolidateRawPropsInWCalls } from '../rewrite/index.js';
import type { NestedCallSiteInfo } from './segment-codegen.js';
import {
  blankNonCode,
  isInsideString,
  pureAwareOverwriteStart,
  scanMatchingParenForward,
} from '../edit/text-scanning.js';
import { replaceOutsideStrings, wholeIdentifierPattern } from '../edit/identifier-boundary.js';

const qwikDisableDirective = /\/\*\s*@qwik-disable-next-line\s+\w+\s*\*\/\s*\n?/g;

function getNestedCallSiteStart(site: NestedCallSiteInfo): number {
  if (!site.isJsxAttr) {
    return site.callStart;
  }
  return site.attrStart ?? site.callStart;
}

/** MUST run before any other text modifications because it uses original source positions. */
export function rewriteNestedCallSitesInline(
  bodyText: string,
  nestedCallSites: NestedCallSiteInfo[],
  bodyOffset: number,
  preserveOffsets = false
): string {
  const sorted = nestedCallSites
    .map((site) => {
      const captureStart =
        site.explicitCaptures && site.argEnd !== undefined
          ? bodyText.indexOf(site.explicitCaptures, site.argEnd - bodyOffset)
          : -1;
      return {
        ...site,
        explicitCaptureStart: captureStart >= 0 ? captureStart + bodyOffset : undefined,
        explicitCaptureEnd:
          captureStart >= 0 && site.explicitCaptures
            ? captureStart + bodyOffset + site.explicitCaptures.length
            : undefined,
      };
    })
    .sort((a, b) => getNestedCallSiteStart(b) - getNestedCallSiteStart(a));

  const loopWDecls: LoopWDecl[] = [];
  const replaceBodyRange = (start: number, end: number, replacement: string): void => {
    if (start < 0 || end > bodyText.length) {
      return;
    }
    if (preserveOffsets && replacement.length < end - start) {
      replacement += ' '.repeat(end - start - replacement.length);
    }
    const offsetChange = replacement.length - (end - start);
    const absoluteEnd = end + bodyOffset;
    for (const pendingSite of sorted) {
      if (
        pendingSite.explicitCaptureStart !== undefined &&
        pendingSite.explicitCaptureStart >= absoluteEnd
      ) {
        pendingSite.explicitCaptureStart += offsetChange;
      }
      if (
        pendingSite.explicitCaptureEnd !== undefined &&
        pendingSite.explicitCaptureEnd >= absoluteEnd
      ) {
        pendingSite.explicitCaptureEnd += offsetChange;
      }
      if (pendingSite.callStart >= absoluteEnd) {
        pendingSite.callStart += offsetChange;
      }
      if (pendingSite.callEnd >= absoluteEnd) {
        pendingSite.callEnd += offsetChange;
      }
      if (pendingSite.argEnd !== undefined && pendingSite.argEnd >= absoluteEnd) {
        pendingSite.argEnd += offsetChange;
      }
      if (pendingSite.attrStart !== undefined && pendingSite.attrStart >= absoluteEnd) {
        pendingSite.attrStart += offsetChange;
      }
      if (pendingSite.attrEnd !== undefined && pendingSite.attrEnd >= absoluteEnd) {
        pendingSite.attrEnd += offsetChange;
      }
    }
    bodyText = bodyText.slice(0, start) + replacement + bodyText.slice(end);
  };

  for (const site of sorted) {
    if (
      site.isJsxAttr &&
      site.attrStart !== undefined &&
      site.attrEnd !== undefined &&
      site.transformedPropName
    ) {
      // A JSX-attr child that captures but isn't on the loop-cross hoist path
      // (`hoistedSymbolName` unset) still needs `.w([captures])` wrapping at
      // the parent's prop call site.
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
      replaceBodyRange(relStart, relEnd, `${site.transformedPropName}={${propValueRef}}`);

      if (
        site.hoistedSymbolName &&
        site.hoistedCaptureNames &&
        site.hoistedCaptureNames.length > 0
      ) {
        const wCall = formatWCall(site.qrlVarName, site.hoistedCaptureNames, '        ', '    ');
        // Sites run last to first; unshift keeps the bindings in source order.
        loopWDecls.unshift({
          decl: `const ${site.hoistedSymbolName} = ${wCall};`,
          symbolName: site.hoistedSymbolName,
          captureNames: site.hoistedCaptureNames,
        });
      }
    } else {
      let relStart = site.callStart - bodyOffset;
      const relEnd = site.callEnd - bodyOffset;
      let qrlRef = site.qrlVarName;
      // Full inlinedQrl captures win over identifier-only captureNames here:
      // dropping a non-identifier capture leaves `_capturesObj._[i]` undefined.
      const liveExplicitCaptures =
        site.explicitCaptureStart !== undefined && site.explicitCaptureEnd !== undefined
          ? bodyText.slice(
              site.explicitCaptureStart - bodyOffset,
              site.explicitCaptureEnd - bodyOffset
            )
          : undefined;
      const explicitCaptureItems = liveExplicitCaptures
        ? parseArrayItems(liveExplicitCaptures)
        : site.explicitCaptureItems;
      const wrapItems =
        explicitCaptureItems && explicitCaptureItems.length > 0
          ? explicitCaptureItems
          : site.captureNames;
      if (wrapItems && wrapItems.length > 0) {
        qrlRef = formatWCall(site.qrlVarName, wrapItems, '        ', '    ');
      }
      let replacement: string;
      if (site.qrlCallee) {
        // Wrapped in a `*Qrl(…)` call — a preceding PURE annotation still
        // applies to the call, so leave it be (and re-emit our own if needed).
        // Preserve arguments after the extracted closure (e.g. task options).
        const relArgEnd = site.argEnd !== undefined ? site.argEnd - bodyOffset : -1;
        const trailingArgs =
          relArgEnd > relStart && relArgEnd < relEnd ? bodyText.slice(relArgEnd, relEnd - 1) : '';
        replacement = `${needsPureAnnotation(site.qrlCallee) ? '/*#__PURE__*/ ' : ''}${site.qrlCallee}(${qrlRef}${trailingArgs})`;
      } else {
        // Replaced by a bare `q_<symbol>` identifier: consume a leading PURE
        // annotation so it isn't stranded before the identifier (a fatal
        // Rolldown INVALID_ANNOTATION once reflowed onto its own line).
        relStart = pureAwareOverwriteStart(bodyText, relStart);
        replacement = qrlRef;
      }
      replaceBodyRange(relStart, relEnd, replacement);
    }
  }

  return loopWDecls.length > 0 ? insertLoopWDecls(bodyText, loopWDecls) : bodyText;
}

export function inlineEnumReferences(
  bodyText: string,
  enumValueMap: Map<string, Map<string, string>>
): string {
  for (const [enumName, members] of enumValueMap) {
    for (const [memberName, value] of members) {
      // No preceding `.`/ident (a member path like `x.Status.Active` is not
      // the enum) and never inside strings or comments.
      const pattern = new RegExp(`(?<![\\w$.])${enumName}\\s*\\.\\s*${memberName}(?![\\w$])`, 'g');
      bodyText = replaceOutsideStrings(bodyText, pattern, value);
    }
  }
  return bodyText;
}

/**
 * When a component body declares `const X = call(q_yyy.w([X]))`, the capture array references `X`
 * inside its own initializer — TDZ. Rewrites to:
 *
 * ```
 * const _ref = {};
 * _ref.X = call(q_yyy.w([_ref.X]));
 * const { X } = _ref;
 * ```
 *
 * Detection is conservative: only `q_xxx.w([...])` arrays are inspected for Identifier elements
 * matching the enclosing const declarator name.
 */
export function applySelfRefIndirection(bodyText: string): string {
  if (!bodyText.includes('.w([')) {
    return bodyText;
  }

  const session = createFunctionTransformSession(bodyText);
  if (!session) {
    return bodyText;
  }
  const block = session.fn.body;
  if (!block || block.type !== 'BlockStatement') {
    return bodyText;
  }

  let foundAny = false;
  for (const stmt of block.body ?? []) {
    if (
      stmt.type !== 'VariableDeclaration' ||
      stmt.kind !== 'const' ||
      stmt.declarations?.length !== 1
    ) {
      continue;
    }
    const d = stmt.declarations[0];
    if (d?.id?.type !== 'Identifier' || !d.init) {
      continue;
    }
    const { name } = d.id;
    let referenced = false;
    walk(d.init, {
      enter(node: AstNode) {
        if (node.type !== 'CallExpression') {
          return;
        }
        // The parser emits 'MemberExpression', not a 'StaticMemberExpression' shape.
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') {
          return;
        }
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'w') {
          return;
        }
        if (callee.object.type !== 'Identifier' || !callee.object.name.startsWith('q_')) {
          return;
        }
        const arr = node.arguments[0];
        if (!arr || arr.type !== 'ArrayExpression') {
          return;
        }
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

  if (!foundAny) {
    return bodyText;
  }
  insertFunctionBodyPrologue(session, session.fn, '    const _ref = {};');
  return session.toSource();
}

export function applyRawPropsToSegmentBody(
  bodyText: string,
  parts: string[],
  preferredDynamicDefaultNames?: ReadonlyMap<string, string>
): string {
  const result = applyRawPropsTransform(bodyText, preferredDynamicDefaultNames);
  if (result === bodyText) {
    return bodyText;
  }

  bodyText = consolidateRawPropsInWCalls(result);
  if (bodyText.includes('_restProps(') && !parts.some((p) => p.includes('_restProps'))) {
    insertImportBeforeSeparator(parts, `import { _restProps } from "@qwik.dev/core";`);
  }
  if (bodyText.includes('untrack(') && !parts.some((p) => p.includes('untrack'))) {
    insertImportBeforeSeparator(parts, `import { untrack } from "@qwik.dev/core";`);
  }
  return bodyText;
}

/** Must run AFTER nested call site rewriting, which uses original positions. */
export function stripDiagnosticsAndDirectives(bodyText: string): string {
  bodyText = bodyText.replace(qwikDisableDirective, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    // Directive-shaped STRING data is not a directive.
    return isInsideString(bodyText, offset) ? match : '';
  });

  if (!bodyText.includes('passive:')) {
    return bodyText;
  }

  // Match tags and directives on the blanked copy (attribute string values
  // spaced out, positions preserved), then delete the found ranges from the
  // original — a `passive:` or `>` inside a string can't confuse the scan.
  const code = blankNonCode(bodyText);
  const deletions: Array<{ start: number; end: number }> = [];
  for (const tag of code.matchAll(/<(\w+)([^>]*?)>/g)) {
    const attrs = tag[2];
    const attrsStart = tag.index + 1 + tag[1].length;
    const elementPassive = new Set<string>();
    for (const m of attrs.matchAll(/passive:(\w+)/g)) {
      elementPassive.add(m[1]);
    }
    if (elementPassive.size === 0) {
      continue;
    }
    for (const m of attrs.matchAll(/\s*passive:\w+/g)) {
      deletions.push({ start: attrsStart + m.index, end: attrsStart + m.index + m[0].length });
    }
    for (const m of attrs.matchAll(/\s*preventdefault:(\w+)/g)) {
      if (elementPassive.has(m[1])) {
        deletions.push({ start: attrsStart + m.index, end: attrsStart + m.index + m[0].length });
      }
    }
  }
  if (deletions.length === 0) {
    return bodyText;
  }

  deletions.sort((a, b) => a.start - b.start);
  let out = '';
  let last = 0;
  for (const d of deletions) {
    out += bodyText.slice(last, d.start);
    last = d.end;
  }
  return out + bodyText.slice(last);
}

export function transformSyncCalls(bodyText: string, parts: string[]): string {
  if (!bodyText.includes('sync$(')) {
    return bodyText;
  }

  // Call sites are located on the blanked copy so `sync$(` inside a string or
  // comment is data, not a call.
  const blanked = blankNonCode(bodyText);
  let didTransform = false;
  let result = '';
  let i = 0;
  while (i < bodyText.length) {
    const syncIdx = blanked.indexOf('sync$(', i);
    if (syncIdx === -1) {
      result += bodyText.slice(i);
      break;
    }

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
    didTransform = true;
  }
  if (!didTransform) {
    return bodyText;
  }

  bodyText = result;
  const syncSepIdx = parts.indexOf('//');
  if (syncSepIdx >= 0 && !parts.some((p) => p.includes('_qrlSync'))) {
    parts.splice(syncSepIdx, 0, `import { _qrlSync } from "@qwik.dev/core";`);
  }
  return bodyText;
}

export function ensureCoreImports(bodyText: string, parts: string[]): void {
  const coreSymbols = [
    '_jsxSorted',
    '_jsxSplit',
    '_fnSignal',
    '_wrapProp',
    '_restProps',
    '_getVarProps',
    '_getConstProps',
  ];

  for (const sym of coreSymbols) {
    if (bodyText.includes(sym) && !partsHaveImport(parts, sym)) {
      insertImportBeforeSeparator(parts, `import { ${sym} } from "@qwik.dev/core";`);
    }
  }
  // `_qrlWithChunk` is a prefix of `_qrlWithChunkDEV`, so match the call exactly.
  for (const sym of ['_qrlWithChunkDEV', '_qrlWithChunk']) {
    if (new RegExp(`\\b${sym}\\(`).test(bodyText) && !partsHaveImport(parts, sym)) {
      insertImportBeforeSeparator(parts, `import { ${sym} } from "@qwik.dev/core";`);
    }
  }
  if (bodyText.includes('_Fragment') && !partsHaveImport(parts, '_Fragment')) {
    insertImportBeforeSeparator(
      parts,
      `import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";`
    );
  }
}

export function removeDeadConstLiterals(
  bodyText: string,
  inlinedIdentifiers?: ReadonlySet<string>
): string {
  let session: FunctionTransformSession | null;
  try {
    session = createFunctionTransformSession(bodyText, { tolerateErrors: true });
  } catch {
    return bodyText;
  }
  if (!session) {
    return bodyText;
  }

  const fnBody = session.fn.body;
  if (!fnBody || fnBody.type !== 'BlockStatement') {
    return bodyText;
  }

  const offset = session.offset;
  const stmts = fnBody.body;
  if (!stmts || stmts.length === 0) {
    return bodyText;
  }

  interface DeadCandidate {
    name: string;
    stmtStart: number;
    stmtEnd: number;
  }
  const candidates: DeadCandidate[] = [];

  for (const stmt of stmts) {
    if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') {
      continue;
    }
    if (stmt.declarations.length !== 1) {
      continue;
    }
    const d = stmt.declarations[0];
    if (d.id?.type !== 'Identifier') {
      continue;
    }
    const initNode = d.init;
    if (!initNode) {
      continue;
    }
    const isLiteral =
      initNode.type === 'Literal' &&
      (initNode.value === null || typeof initNode.value !== 'object');
    if (!isLiteral && !inlinedIdentifiers?.has(d.id.name)) {
      continue;
    }

    candidates.push({
      name: d.id.name,
      stmtStart: stmt.start - offset,
      stmtEnd: stmt.end - offset,
    });
  }

  if (candidates.length === 0) {
    return bodyText;
  }

  const toRemove: DeadCandidate[] = [];
  for (const c of candidates) {
    const rest = bodyText.slice(0, c.stmtStart) + bodyText.slice(c.stmtEnd);
    if (!wholeIdentifierPattern(c.name).test(rest)) {
      toRemove.push(c);
    }
  }

  if (toRemove.length === 0) {
    return bodyText;
  }

  toRemove.sort((a, b) => b.stmtStart - a.stmtStart);
  let result = bodyText;
  for (const c of toRemove) {
    let end = c.stmtEnd;
    while (
      end < result.length &&
      (result[end] === '\n' || result[end] === '\r' || result[end] === ';')
    ) {
      end++;
    }
    let start = c.stmtStart;
    while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) {
      start--;
    }
    result = result.slice(0, start) + result.slice(end);
  }

  return result;
}

export function rewriteFunctionSignature(bodyText: string, paramNames: string[]): string {
  const session = createFunctionTransformSession(bodyText);
  if (!session) {
    return bodyText;
  }
  if (!replaceFunctionParams(session, session.fn, paramNames)) {
    return bodyText;
  }
  return session.toSource();
}

export function injectCapturesUnpacking(bodyText: string, captureNames: string[]): string {
  if (captureNames.length === 0) {
    return bodyText;
  }

  const unpackParts = captureNames.map((name, i) => `${name} = _capturesObj._[${i}]`);
  // `let` matches the Rust optimizer's `read_captures` output.
  const unpackLine = `let ${unpackParts.join(', ')};`;

  const session = createFunctionTransformSession(bodyText);
  if (!session) {
    return bodyText;
  }

  insertFunctionBodyPrologue(session, session.fn, unpackLine);
  return session.toSource();
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
  return parts.some(
    (p) =>
      p.includes(`{ ${symbol} }`) ||
      p.includes(`{ ${symbol},`) ||
      p.includes(`, ${symbol} }`) ||
      p.includes(`, ${symbol},`) ||
      p.includes(`as ${symbol}`) ||
      p.includes(`* as ${symbol}`) ||
      // Default import — binds the name just as much as a named one.
      p.startsWith(`import ${symbol} from`) ||
      p.startsWith(`import ${symbol},`)
  );
}
