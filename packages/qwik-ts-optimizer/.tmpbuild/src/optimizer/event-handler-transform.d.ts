/**
 * Event handler prop naming transformation for the Qwik optimizer.
 *
 * Transforms JSX event prop names to Qwik's serialized event format:
 * - onClick$ -> "q-e:click" (element scope)
 * - document:onFocus$ -> "q-d:focus" (document scope)
 * - window:onClick$ -> "q-w:click" (window scope)
 * - host:onClick$ -> null (passthrough, no transformation)
 * - on-customName$ -> "q-e:custom-name" (kebab-case custom events)
 * - passive events use q-ep:/q-wp:/q-dp: prefixes
 */
export interface EventTransformResult {
    outputPropName: string;
    isHtmlOnly: boolean;
    stripPassive: string[];
}
/**
 * Check if a JSX prop name is an event handler that will be transformed.
 *
 * Returns true for props starting with `on` (with optional scope prefix)
 * and ending with `$`. Does NOT match non-event `$` props like `custom$`.
 */
export declare function isEventProp(propName: string): boolean;
export declare function isPassiveDirective(propName: string): boolean;
/**
 * Convert camelCase string to kebab-case.
 */
export declare function camelToKebab(str: string): string;
/**
 * Transform an event prop name to Qwik's serialized format.
 *
 * Returns the transformed prop name string, or null if the prop should
 * pass through unchanged (host: prefix, non-event $ props, etc.).
 * Matches Rust's `jsx_event_to_html_attribute`.
 */
export declare function transformEventPropName(propName: string, passiveEvents: Set<string>): string | null;
/**
 * Convert a JSX event name to its plain event name for matching/display.
 * Matches Rust's `jsx_event_to_event_name`.
 */
export declare function jsxEventToEventName(jsxEvent: string): string | null;
/**
 * Scan JSX attributes for passive:* directives and collect normalized event names.
 * Matches Rust's `collect_passive_event_names_from_jsx_attrs`.
 */
export declare function collectPassiveDirectives(attributes: any[]): Set<string>;
//# sourceMappingURL=event-handler-transform.d.ts.map