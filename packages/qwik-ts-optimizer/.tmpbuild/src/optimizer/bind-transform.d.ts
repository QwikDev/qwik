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
export interface BindTransformResult {
    /** Output prop name: "value", "checked", or "bind:xxx" for unknown */
    propName: string;
    /** The signal/expression source text */
    propValue: string;
    /** Event handler info, or null for unknown bind props */
    handler: {
        name: string;
        code: string;
    } | null;
    /** Imports needed from @qwik.dev/core (e.g., ['inlinedQrl', '_val']) */
    needsImport: string[];
}
/**
 * Check if a prop name is a bind syntax prop (starts with `bind:`).
 */
export declare function isBindProp(propName: string): boolean;
/**
 * Transform a bind prop into its desugared form.
 *
 * @param bindAttrName - The full bind attribute name (e.g., "bind:value")
 * @param valueExprSource - The source text of the value expression (e.g., "value", "localValue")
 * @returns BindTransformResult with prop info, handler, and needed imports
 */
export declare function transformBindProp(bindAttrName: string, valueExprSource: string): BindTransformResult;
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
export declare function mergeEventHandlers(existingHandler: string | null, newHandler: string): string;
//# sourceMappingURL=bind-transform.d.ts.map