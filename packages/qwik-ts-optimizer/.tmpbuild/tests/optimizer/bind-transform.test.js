/**
 * Tests for bind syntax desugaring.
 *
 * Verified against snapshot corpus:
 * - example_input_bind.snap
 * - should_merge_on_input_and_bind_checked.snap
 * - should_move_bind_value_to_var_props.snap
 */
import { describe, it, expect } from 'vitest';
import { transformBindProp, isBindProp, mergeEventHandlers, } from '../../src/optimizer/bind-transform.js';
describe('bind-transform', () => {
    describe('isBindProp', () => {
        it('returns true for bind:value', () => {
            expect(isBindProp('bind:value')).toBe(true);
        });
        it('returns true for bind:checked', () => {
            expect(isBindProp('bind:checked')).toBe(true);
        });
        it('returns true for bind:stuff', () => {
            expect(isBindProp('bind:stuff')).toBe(true);
        });
        it('returns false for onClick$', () => {
            expect(isBindProp('onClick$')).toBe(false);
        });
        it('returns false for class', () => {
            expect(isBindProp('class')).toBe(false);
        });
        it('returns false for value (no bind: prefix)', () => {
            expect(isBindProp('value')).toBe(false);
        });
    });
    describe('transformBindProp', () => {
        // BIND-01: bind:value -> value prop + q-e:input handler with inlinedQrl(_val, "_val", [signal])
        it('transforms bind:value with inlinedQrl(_val)', () => {
            const result = transformBindProp('bind:value', 'value');
            expect(result.propName).toBe('value');
            expect(result.propValue).toBe('value');
            expect(result.handler).not.toBeNull();
            expect(result.handler.name).toBe('q-e:input');
            expect(result.handler.code).toBe('inlinedQrl(_val, "_val", [value])');
            expect(result.needsImport).toContain('inlinedQrl');
            expect(result.needsImport).toContain('_val');
        });
        // BIND-02: bind:checked -> checked prop + q-e:input handler with inlinedQrl(_chk, "_chk", [signal])
        it('transforms bind:checked with inlinedQrl(_chk)', () => {
            const result = transformBindProp('bind:checked', 'checked');
            expect(result.propName).toBe('checked');
            expect(result.propValue).toBe('checked');
            expect(result.handler).not.toBeNull();
            expect(result.handler.name).toBe('q-e:input');
            expect(result.handler.code).toBe('inlinedQrl(_chk, "_chk", [checked])');
            expect(result.needsImport).toContain('inlinedQrl');
            expect(result.needsImport).toContain('_chk');
        });
        // BIND-03: bind:stuff -> passthrough with no handler
        it('passes through unknown bind:stuff without handler', () => {
            const result = transformBindProp('bind:stuff', 'stuff');
            expect(result.propName).toBe('bind:stuff');
            expect(result.propValue).toBe('stuff');
            expect(result.handler).toBeNull();
            expect(result.needsImport).toEqual([]);
        });
        // bind:value with different expression source
        it('handles bind:value with a different expression', () => {
            const result = transformBindProp('bind:value', 'localValue');
            expect(result.propName).toBe('value');
            expect(result.propValue).toBe('localValue');
            expect(result.handler.code).toBe('inlinedQrl(_val, "_val", [localValue])');
        });
        // bind:checked with different expression source
        it('handles bind:checked with a different expression', () => {
            const result = transformBindProp('bind:checked', 'localChecked');
            expect(result.propName).toBe('checked');
            expect(result.propValue).toBe('localChecked');
            expect(result.handler.code).toBe('inlinedQrl(_chk, "_chk", [localChecked])');
        });
        // Another unknown bind variant
        it('passes through bind:disabled without handler', () => {
            const result = transformBindProp('bind:disabled', 'isDisabled');
            expect(result.propName).toBe('bind:disabled');
            expect(result.propValue).toBe('isDisabled');
            expect(result.handler).toBeNull();
        });
    });
    describe('mergeEventHandlers', () => {
        it('returns new handler when no existing handler', () => {
            const result = mergeEventHandlers(null, 'newHandler');
            expect(result).toBe('newHandler');
        });
        it('merges existing and new handler into array', () => {
            const result = mergeEventHandlers('existingHandler', 'newHandler');
            expect(result).toBe('[newHandler, existingHandler]');
        });
        it('merges bind:checked inlinedQrl with extracted handler QRL', () => {
            const bindHandler = 'inlinedQrl(_chk, "_chk", [localValue])';
            const existingHandler = 'q_FieldInput_component_input_q_e_input_wqR1xEjZjf4';
            const result = mergeEventHandlers(existingHandler, bindHandler);
            expect(result).toBe(`[${bindHandler}, ${existingHandler}]`);
        });
    });
});
//# sourceMappingURL=bind-transform.test.js.map