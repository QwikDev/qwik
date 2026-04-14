/**
 * Raw props transformation for component$ extractions.
 *
 * Rewrites destructured parameters like ({field1, field2}) => ...
 * to (_rawProps) => ... _rawProps.field1 ... for signal analysis.
 * Also handles body-level destructuring, rest elements, and
 * .w() call consolidation.
 */

import { parseSync } from 'oxc-parser';
import { buildPropertyAccessor } from '../utils/identifier-name.js';
import { rewritePropsFieldReferences } from '../utils/props-field-rewrite.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';

// ── Shared helpers ──

// Uses `any` because OXC runtime key nodes (StringLiteral, Identifier) have
// .name/.value properties not present in the PropertyKey type union.
export function getObjectPropertyKeyName(key: any): string | null {
  if (key?.type === 'Identifier') {
    return key.name;
  }
  if (key?.type === 'StringLiteral' || key?.type === 'Literal') {
    return key.value == null ? null : String(key.value);
  }
  return null;
}

// Uses `any` because runtime OXC value nodes include AssignmentPattern
// with .left/.name properties not fully typed in the Node union.
export function getAssignedIdentifierName(value: any): string | null {
  if (value?.type === 'Identifier') {
    return value.name;
  }
  if (value?.type === 'AssignmentPattern' && value.left?.type === 'Identifier') {
    return value.left.name;
  }
  return null;
}

/**
 * Options for JSX transpilation within inline .s() body text.
 */
export interface SCallBodyJsxOptions {
  /** Whether to apply JSX transpilation */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Dev mode options for JSX source info */
  devOptions?: { relPath: string };
  /** Starting key counter value (for continuation from module-level JSX) */
  keyCounterStart?: number;
  /** Relative file path for key prefix derivation */
  relPath?: string;
}

/**
 * Inject a line right after the opening brace or arrow of a function body.
 * For block bodies (`=> { ...}`), inserts after `{`.
 * For expression bodies (`=> expr`), converts to block body with return.
 */
export function injectLineAfterBodyOpen(bodyText: string, line: string): string {
  // Find the arrow `=>`
  let depth = 0;
  let inString: string | null = null;
  let arrowIdx = -1;
  for (let i = 0; i < bodyText.length - 1; i++) {
    const ch = bodyText[i];
    if (inString) {
      if (ch === inString && bodyText[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '<') { depth++; continue; }
    if (ch === ')' || ch === ']' || ch === '>') { depth--; continue; }
    if (depth === 0 && ch === '=' && bodyText[i + 1] === '>') { arrowIdx = i; break; }
  }
  if (arrowIdx === -1) {
    // Try function expression
    const braceIdx = bodyText.indexOf('{');
    if (braceIdx >= 0) {
      return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
    }
    return bodyText;
  }
  let afterArrow = arrowIdx + 2;
  while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow])) afterArrow++;
  if (bodyText[afterArrow] === '{') {
    return bodyText.slice(0, afterArrow + 1) + '\n' + line + bodyText.slice(afterArrow + 1);
  }
  // Expression body: convert to block
  const expr = bodyText.slice(afterArrow);
  const prefix = bodyText.slice(0, arrowIdx + 2);
  return prefix + ' {\n' + line + '\nreturn ' + expr + ';\n}';
}

/**
 * Rewrite ({field1, field2}) => ... to (_rawProps) => ... _rawProps.field1 ...
 * so signal analysis detects store field accesses.
 */
export interface RawPropsTransformResult {
  /** The transformed body text */
  body: string;
  /** Whether any transformation was applied */
  transformed: boolean;
  /** The destructured field local names that were replaced with _rawProps.field */
  destructuredFieldLocals: string[];
}

export function applyRawPropsTransformDetailed(body: string): RawPropsTransformResult {
  const result = applyRawPropsTransform(body);
  if (result === body) {
    return { body, transformed: false, destructuredFieldLocals: [] };
  }
  // Extract the field names by re-parsing the original body
  const fieldLocals = [...extractDestructuredFieldMap(body).keys()];
  return { body: result, transformed: true, destructuredFieldLocals: fieldLocals };
}

/**
 * Extract a map from local binding name to property key name from a destructured first parameter.
 * Given `({foo, "bind:value": bindValue}) => ...`, returns Map { "foo" -> "foo", "bindValue" -> "bind:value" }.
 */
export function extractDestructuredFieldMap(body: string): Map<string, string> {
  const wrapperPrefix = 'const __rp__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__rpx__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return new Map();
  const decl = parseResult.program.body?.[0];
  if (!decl || decl.type !== 'VariableDeclaration') return new Map();
  const init = decl.declarations?.[0]?.init;
  if (!init) return new Map();
  let params: any[] | undefined;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    params = init.params;
  }
  if (!params || params.length === 0) return new Map();
  const firstParam = params[0];
  if (firstParam.type !== 'ObjectPattern') return new Map();
  const fieldMap = new Map<string, string>();
  for (const prop of firstParam.properties ?? []) {
    if (prop.type === 'RestElement') continue;
    if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
      const keyName = getObjectPropertyKeyName(prop.key);
      const valName = getAssignedIdentifierName(prop.value);
      if (keyName && valName) fieldMap.set(valName, String(keyName));
    }
  }
  return fieldMap;
}

/**
 * After _rawProps transform, consolidate .w([...]) arrays:
 * Replace any _rawProps.xxx entries with a single _rawProps, deduped.
 *
 * e.g., `.w([arg0, _rawProps.foo, _rawProps.bar])` -> `.w([arg0, _rawProps])`
 *
 * Returns the consolidated body text.
 */
export function consolidateRawPropsInWCalls(body: string): string {
  // Find all .w([...]) patterns and consolidate _rawProps.xxx to _rawProps
  return body.replace(/\.w\(\[\s*([\s\S]*?)\s*\]\)/g, (fullMatch, captureContent: string) => {
    // Split by comma, trim whitespace
    const items = captureContent.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    if (items.length === 0) return fullMatch;

    // Check if any items are _rawProps.xxx
    let hasRawPropsField = false;
    const consolidated: string[] = [];
    let hasRawProps = false;
    for (const item of items) {
      if (item.startsWith('_rawProps.') || item.startsWith('_rawProps[')) {
        hasRawPropsField = true;
        if (!hasRawProps) {
          consolidated.push('_rawProps');
          hasRawProps = true;
        }
      } else if (item === '_rawProps') {
        if (!hasRawProps) {
          consolidated.push('_rawProps');
          hasRawProps = true;
        }
      } else {
        consolidated.push(item);
      }
    }

    if (!hasRawPropsField) return fullMatch;

    // Rebuild .w([...]) with consolidated items
    if (consolidated.length === 1) {
      return `.w([\n        ${consolidated[0]}\n    ])`;
    }
    return `.w([\n        ${consolidated.join(',\n        ')}\n    ])`;
  });
}

export function applyRawPropsTransform(body: string): string {
  const wrapperPrefix = 'const __rp__ = ';
  const wrappedSource = wrapperPrefix + body;

  const parseResult = parseSync('__rp__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) {
    return body;
  }

  // Find the arrow/function expression in the init of the const declaration
  const decl = parseResult.program.body?.[0];
  if (!decl || decl.type !== 'VariableDeclaration') return body;
  const init = decl.declarations?.[0]?.init;
  if (!init) return body;

  // Get params from arrow function or function expression
  let params: any[] | undefined;
  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    params = init.params;
  }
  if (!params || params.length === 0) return body;

  const firstParam = params[0];

  // Calculate positions relative to the body string (subtract wrapperPrefix length)
  const offset = wrapperPrefix.length;

  // Body-level destructure: keep original param name so signal analysis
  // produces _wrapProp(props, "bind:value") matching SWC output.
  if (firstParam.type === 'Identifier') {
    const paramName = firstParam.name;
    const funcBody = (init as any).body;
    if (!funcBody || funcBody.type !== 'BlockStatement') return body;

    let destructureDecl: any = null;
    let destructureDeclIdx = -1;
    for (let i = 0; i < (funcBody.body?.length ?? 0); i++) {
      const stmt = funcBody.body[i];
      if (stmt.type === 'VariableDeclaration') {
        for (const d of stmt.declarations ?? []) {
          if (d.id?.type === 'ObjectPattern' && d.init?.type === 'Identifier' && d.init.name === paramName) {
            destructureDecl = d;
            destructureDeclIdx = i;
            break;
          }
        }
      }
      if (destructureDecl) break;
    }

    if (!destructureDecl) return body;

    // Extract fields from the destructure pattern
    const bodyFields: Array<{ key: string; local: string }> = [];
    let bodyRestElementName: string | null = null;
    for (const prop of destructureDecl.id.properties ?? []) {
      if (prop.type === 'RestElement') {
        const restId = prop.argument?.type === 'Identifier' ? prop.argument.name : null;
        if (restId) bodyRestElementName = restId;
        continue;
      }
      if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
        const keyName = getObjectPropertyKeyName(prop.key);
        const valName = getAssignedIdentifierName(prop.value);
        if (keyName && valName) {
          bodyFields.push({ key: String(keyName), local: valName });
        }
      }
    }

    if (bodyFields.length === 0 && !bodyRestElementName) return body;

    let result = body;

    const stmtNode = funcBody.body[destructureDeclIdx];
    const stmtStart = stmtNode.start - offset;
    const stmtEnd = stmtNode.end - offset;
    let lineStart = stmtStart;
    while (lineStart > 0 && (result[lineStart - 1] === ' ' || result[lineStart - 1] === '\t')) {
      lineStart--;
    }
    let afterStmt = result.slice(stmtEnd);
    if (afterStmt.startsWith('\n')) afterStmt = afterStmt.slice(1);
    else if (afterStmt.startsWith('\r\n')) afterStmt = afterStmt.slice(2);
    result = result.slice(0, lineStart) + afterStmt;

    if (bodyRestElementName) {
      if (bodyFields.length > 0) {
        const excludedKeys = bodyFields.map(f => `"${f.key}"`).join(',\n    ');
        const restLine = `const ${bodyRestElementName} = _restProps(${paramName}, [\n    ${excludedKeys}\n]);`;
        result = injectLineAfterBodyOpen(result, restLine);
      } else {
        const restLine = `const ${bodyRestElementName} = _restProps(${paramName});`;
        result = injectLineAfterBodyOpen(result, restLine);
      }
    }

    const fieldLocalToKey = new Map<string, string>();
    for (const f of bodyFields) {
      fieldLocalToKey.set(f.local, f.key);
    }

    const reparseSource = wrapperPrefix + result;
    const reparseResult = parseSync('__rp_body__.tsx', reparseSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (!reparseResult.program || reparseResult.errors?.length) return result;

    const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];
    function walkForBodyIdents(node: any, parentKey?: string, parentNode?: any): void {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
        const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
        const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
        const isParam = parentKey === 'params';
        const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
        const isShorthandValue = parentKey === 'value' &&
          (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
          parentNode?.shorthand === true;
        if (isShorthandValue) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)!, isShorthand: true });
        } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)! });
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item.type === 'string') walkForBodyIdents(item, key, node);
            }
          } else if (typeof val.type === 'string') {
            walkForBodyIdents(val, key, node);
          }
        }
      }
    }
    walkForBodyIdents(reparseResult.program);
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      const accessor = buildPropertyAccessor(paramName, r.key);
      if (r.isShorthand) {
        result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
      } else {
        result = result.slice(0, r.start) + accessor + result.slice(r.end);
      }
    }
    return result;
  }

  if (firstParam.type !== 'ObjectPattern') return body;

  const fields: Array<{ key: string; local: string; defaultValue?: string }> = [];
  let restElementName: string | null = null;
  for (const prop of firstParam.properties ?? []) {
    if (prop.type === 'RestElement') {
      const restId = prop.argument?.type === 'Identifier' ? prop.argument.name : null;
      if (restId) restElementName = restId;
      continue;
    }
    if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
      const keyName = prop.key?.type === 'Identifier' ? prop.key.name
                    : (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') ? (prop.key.value ?? null)
                    : null;
      let valName: string | null = null;
      let defaultValue: string | undefined;
      if (prop.value?.type === 'Identifier') {
        valName = prop.value.name;
      } else if (prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier') {
        valName = prop.value.left.name;
        if (prop.value.right) {
          const defStart = prop.value.right.start - offset;
          const defEnd = prop.value.right.end - offset;
          if (defStart >= 0 && defEnd <= body.length) {
            defaultValue = body.slice(defStart, defEnd);
          }
        }
      }
      if (keyName && valName) {
        fields.push({ key: String(keyName), local: valName, defaultValue });
      }
    }
  }


  if (restElementName && fields.length === 0) {
    const paramStartPos = firstParam.start - offset;
    const paramEndPos = firstParam.end - offset;
    let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
    const restLine = `const ${restElementName} = _restProps(_rawProps);`;
    result = injectLineAfterBodyOpen(result, restLine);
    return result;
  }

  if (restElementName && fields.length > 0) {
    const paramStartPos = firstParam.start - offset;
    const paramEndPos = firstParam.end - offset;
    let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
    const excludedKeys = fields.map(f => `"${f.key}"`).join(',\n    ');
    const restLine = `const ${restElementName} = _restProps(_rawProps, [\n    ${excludedKeys}\n]);`;
    result = injectLineAfterBodyOpen(result, restLine);

    const fieldLocalToKey = new Map<string, string>();
    for (const f of fields) {
      fieldLocalToKey.set(f.local, f.key);
    }

    const reparseSource = wrapperPrefix + result;
    const reparseResult2 = parseSync('__rp3__.tsx', reparseSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (!reparseResult2.program || reparseResult2.errors?.length) return result;

    const replacements: Array<{ start: number; end: number; key: string; isShorthand?: boolean }> = [];
    function walkForIdents(node: any, parentKey?: string, parentNode?: any): void {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
        const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
        const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
        const isParam = parentKey === 'params';
        const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
        const isShorthandValue = parentKey === 'value' &&
          (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
          parentNode?.shorthand === true;
        if (isShorthandValue) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)!, isShorthand: true });
        } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
          replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name)! });
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item.type === 'string') walkForIdents(item, key, node);
            }
          } else if (typeof val.type === 'string') {
            walkForIdents(val, key, node);
          }
        }
      }
    }
    walkForIdents(reparseResult2.program);
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      const accessor = buildPropertyAccessor('_rawProps', r.key);
      if (r.isShorthand) {
        result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
      } else {
        result = result.slice(0, r.start) + accessor + result.slice(r.end);
      }
    }
    return result;
  }

  if (fields.length === 0) return body;

  const paramStart = firstParam.start - offset;
  const paramEnd = firstParam.end - offset;

  let result = body.slice(0, paramStart) + '_rawProps' + body.slice(paramEnd);

  const fieldLocalToKey = new Map<string, string>();
  const fieldLocalToDefault = new Map<string, string>();
  for (const f of fields) {
    fieldLocalToKey.set(f.local, f.key);
    if (f.defaultValue !== undefined) {
      fieldLocalToDefault.set(f.local, f.defaultValue);
    }
  }

  const reparseSource = wrapperPrefix + result;
  const reparseResult = parseSync('__rp2__.tsx', reparseSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!reparseResult.program || reparseResult.errors?.length) return result;

  const replacements: Array<{ start: number; end: number; key: string; local: string; isShorthand?: boolean }> = [];

  function walkForIdentifiers(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
      const isParam = parentKey === 'params';
      const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';

      // Shorthand properties ({ some }) need expansion to `key: _rawProps.key`
      const isShorthandValue = parentKey === 'value' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
          local: node.name,
          isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
          local: node.name,
        });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') {
              walkForIdentifiers(item, key, node);
            }
          }
        } else if (typeof val.type === 'string') {
          walkForIdentifiers(val, key, node);
        }
      }
    }
  }

  walkForIdentifiers(reparseResult.program);

  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    let accessor = buildPropertyAccessor('_rawProps', r.key);
    // Parenthesized ?? preserves default values from destructuring
    const defaultVal = fieldLocalToDefault.get(r.local);
    if (defaultVal !== undefined) {
      accessor = `(${accessor} ?? ${defaultVal})`;
    }
    if (r.isShorthand) {
      result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
    } else {
      result = result.slice(0, r.start) + accessor + result.slice(r.end);
    }
  }

  return result;
}

/**
 * Replace original field name references with _rawProps.field in a body string.
 * For child segments whose captures were consolidated into a single _rawProps capture.
 */
export function replacePropsFieldReferencesInBody(body: string, fieldMap: Map<string, string>): string {
  return rewritePropsFieldReferences(body, fieldMap, {
    parseFilename: '__rpfb__.tsx',
    wrapperPrefix: 'const __rpfb__ = ',
    memberPropertyMode: 'nonComputed',
  });
}
