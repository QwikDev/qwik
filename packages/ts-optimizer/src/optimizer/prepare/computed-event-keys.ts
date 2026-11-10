/**
 * Pre-extraction normalization of computed string event keys in `jsx()` props on a dynamic tag:
 * `jsx(Tag, { ['onClick$']: fn })` becomes `jsx(Tag, { onClick$: fn })`, so the handler is
 * extracted and placed like a plain key. Same rule as `normalize_computed_event_keys` in the Rust
 * optimizer.
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { collectImports } from '../extraction/marker-detection.js';
import { isRuntimeEventProp } from '../jsx/event-handlers.js';
import { collectJsxFunctionNamesFromIterable } from '../jsx/jsx-call-transform.js';
import { collectScopeAwareBindings, type ScopeAwareBindings } from '../jsx/jsx.js';

const IDENTIFIER_NAME = /^[A-Za-z_$][\w$]*$/;

export function normalizeComputedJsxEventKeys(
  source: string,
  program: AstProgram,
  edits: MagicString
): { changed: boolean } {
  // Sound prefilter: a computed string key needs a `[` followed by a quote.
  if (!/\[\s*['"]/.test(source)) {
    return { changed: false };
  }
  const jsxFunctions = collectJsxFunctionNamesFromIterable(collectImports(program).values());
  if (jsxFunctions.size === 0) {
    return { changed: false };
  }

  let bindings: ScopeAwareBindings | undefined;
  let changed = false;
  walk(program, {
    enter(node: AstNode) {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        !jsxFunctions.has(node.callee.name)
      ) {
        return;
      }
      const [tag, props] = node.arguments;
      if (!tag || tag.type === 'SpreadElement' || props?.type !== 'ObjectExpression') {
        return;
      }
      let isDynamic: boolean | undefined;
      for (const prop of props.properties) {
        if (
          prop.type !== 'Property' ||
          !prop.computed ||
          prop.kind !== 'init' ||
          prop.method ||
          prop.key.type !== 'Literal' ||
          typeof prop.key.value !== 'string' ||
          !isRuntimeEventProp(prop.key.value)
        ) {
          continue;
        }
        bindings ??= collectScopeAwareBindings(program).bindings;
        isDynamic ??= isDynamicTag(tag, bindings, program);
        if (!isDynamic) {
          return;
        }
        const name = prop.key.value;
        const keyEnd = source.indexOf(']', prop.key.end) + 1;
        edits.overwrite(
          prop.start,
          keyEnd,
          IDENTIFIER_NAME.test(name) ? name : JSON.stringify(name)
        );
        changed = true;
      }
    },
  });
  return { changed };
}

/** Same rule as `isDynamicTagExpr` in the jsx() call transform and the Rust optimizer. */
function isDynamicTag(tag: AstNode, bindings: ScopeAwareBindings, program: AstProgram): boolean {
  if (tag.type === 'Literal') {
    return false;
  }
  if (tag.type !== 'Identifier') {
    return true;
  }
  return bindings.isInnerScopeBinding(tag.name, tag.start, program);
}
