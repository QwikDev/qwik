import type { AstNode } from '../../ast-types.js';
import { isAstNode } from '../../ast-utils.js';
import { parseWithRawTransfer } from '../../parse-utils.js';
import { buildPropertyAccessor } from './identifier-name.js';

interface RewritePropsFieldReferencesOptions {
  parseFilename: string;
  wrapperPrefix?: string;
  wrapperSuffix?: string;
  memberPropertyMode?: 'all' | 'nonComputed';
}

/**
 * Replace bare references to destructured prop field names with _rawProps accessors.
 * Uses AST positions to avoid changing property keys or declaration sites.
 */
export function rewritePropsFieldReferences(
  bodyText: string,
  fieldMap: Map<string, string>,
  options: RewritePropsFieldReferencesOptions,
): string {
  if (fieldMap.size === 0) return bodyText;

  const wrapperPrefix = options.wrapperPrefix ?? '';
  const wrapperSuffix = options.wrapperSuffix ?? '';
  const wrappedSource = wrapperPrefix + bodyText + wrapperSuffix;

  let parseResult;
  try {
    parseResult = parseWithRawTransfer(options.parseFilename, wrappedSource);
  } catch {
    return bodyText;
  }

  if (!parseResult.program || parseResult.errors?.length) return bodyText;

  const offset = wrapperPrefix.length;
  const replacements: Array<{
    start: number;
    end: number;
    key: string;
    isShorthand?: boolean;
  }> = [];

  function walkNode(
    node: AstNode | null | undefined,
    parentKey?: string,
    parentNode?: AstNode | null,
  ): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && fieldMap.has(node.name)) {
      const isPropertyKey =
        parentKey === 'key' &&
        parentNode?.type === 'Property';
      const isMemberProperty =
        parentKey === 'property' &&
        parentNode?.type === 'MemberExpression' &&
        (options.memberPropertyMode === 'all' || !parentNode.computed);
      const isParam = parentKey === 'params';
      const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      const isShorthandValue =
        parentKey === 'value' &&
        parentNode?.type === 'Property' &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldMap.get(node.name)!,
          isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProperty && !isParam && !isDeclaratorId) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldMap.get(node.name)!,
        });
      }
    }

    const record = node as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const value = record[key];
      if (!value || typeof value !== 'object') continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (isAstNode(item)) {
            walkNode(item as AstNode, key, node);
          }
        }
        continue;
      }

      if (isAstNode(value)) {
        walkNode(value as AstNode, key, node);
      }
    }
  }

  walkNode(parseResult.program);
  if (replacements.length === 0) return bodyText;

  replacements.sort((a, b) => b.start - a.start);
  let result = bodyText;
  for (const replacement of replacements) {
    const accessor = buildPropertyAccessor('_rawProps', replacement.key);
    if (replacement.isShorthand) {
      result =
        result.slice(0, replacement.start) +
        replacement.key +
        ': ' +
        accessor +
        result.slice(replacement.end);
    } else {
      result =
        result.slice(0, replacement.start) +
        accessor +
        result.slice(replacement.end);
    }
  }

  return result;
}
