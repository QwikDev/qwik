/**
 * Bind syntax desugaring for the Qwik optimizer.
 *
 * Transforms `bind:value` and `bind:checked` JSX props into:
 * - A value/checked prop with the signal reference
 * - A `q-e:input` event handler using `inlinedQrl` with `_val` or `_chk`
 *
 * Unknown `bind:xxx` props pass through unchanged (no handler generated).
 *
 * When a `bind:checked` or `bind:value` coexists with an explicit `onInput$`,
 * the handlers are merged into an array: `[inlinedQrl(...), existingHandler]`.
 *
 * When spread props are present (`_jsxSplit`), `bind:value` goes to varProps
 * and is NOT desugared (per should_move_bind_value_to_var_props.snap).
 *
 * Verified against snapshot corpus:
 * - example_input_bind.snap
 * - should_merge_on_input_and_bind_checked.snap
 * - should_move_bind_value_to_var_props.snap
 */
const KNOWN_BINDS = {
    value: {
        propName: 'value',
        helperFn: '_val',
        helperStr: '"_val"',
    },
    checked: {
        propName: 'checked',
        helperFn: '_chk',
        helperStr: '"_chk"',
    },
};
// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
/**
 * Check if a prop name is a bind syntax prop (starts with `bind:`).
 */
export function isBindProp(propName) {
    return propName.startsWith('bind:');
}
// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------
/**
 * Transform a bind prop into its desugared form.
 *
 * @param bindAttrName - The full bind attribute name (e.g., "bind:value")
 * @param valueExprSource - The source text of the value expression (e.g., "value", "localValue")
 * @returns BindTransformResult with prop info, handler, and needed imports
 */
export function transformBindProp(bindAttrName, valueExprSource) {
    const bindKey = bindAttrName.slice('bind:'.length);
    const mapping = KNOWN_BINDS[bindKey];
    if (!mapping) {
        // Unknown bind prop: pass through unchanged
        return {
            propName: bindAttrName,
            propValue: valueExprSource,
            handler: null,
            needsImport: [],
        };
    }
    // Known bind (value or checked): generate inlinedQrl handler
    const handlerCode = `inlinedQrl(${mapping.helperFn}, ${mapping.helperStr}, [${valueExprSource}])`;
    return {
        propName: mapping.propName,
        propValue: valueExprSource,
        handler: {
            name: 'q-e:input',
            code: handlerCode,
        },
        needsImport: ['inlinedQrl', mapping.helperFn],
    };
}
// ---------------------------------------------------------------------------
// Handler merging
// ---------------------------------------------------------------------------
/**
 * Merge event handlers when multiple handlers target the same event.
 *
 * Used when `bind:checked` + explicit `onInput$` both produce `q-e:input` handlers.
 * The bind handler comes first in the array (matching snapshot behavior).
 *
 * @param existingHandler - Existing handler expression string, or null
 * @param newHandler - New handler expression string to add
 * @returns Merged handler expression string
 */
export function mergeEventHandlers(existingHandler, newHandler) {
    if (existingHandler === null) {
        return newHandler;
    }
    // Merge into array: new handler (bind) first, then existing
    return `[${newHandler}, ${existingHandler}]`;
}
//# sourceMappingURL=bind-transform.js.map