/**
 * Diagnostic emission and suppression for the Qwik optimizer.
 *
 * Provides functions to create diagnostic objects and to parse/apply
 * @qwik-disable-next-line suppression directives.
 */
import type { Diagnostic, DiagnosticHighlightFlat } from './types.js';
/** C02: captured function/class reference across a $() boundary. */
export declare function emitC02(identName: string, file: string, isClass: boolean, highlightSpan?: DiagnosticHighlightFlat): Diagnostic;
/** C03: $() argument is not a function but captures local identifiers. */
export declare function emitC03(identNames: string[], file: string, highlightSpan?: DiagnosticHighlightFlat): Diagnostic;
/** C05: foo$ called but fooQrl not exported in the same file. */
export declare function emitC05(calleeName: string, qrlName: string, file: string, highlightSpan?: DiagnosticHighlightFlat): Diagnostic;
/** Warning: preventdefault:event does nothing when passive:event is also set. */
export declare function emitPreventdefaultPassiveCheck(eventName: string, file: string, highlightSpan?: DiagnosticHighlightFlat): Diagnostic;
/**
 * Parse @qwik-disable-next-line directives from source code.
 * Returns a map of 1-based line numbers to sets of suppressed diagnostic codes.
 */
export declare function parseDisableDirectives(sourceCode: string): Map<number, Set<string>>;
/** Filter out diagnostics suppressed by @qwik-disable-next-line directives. */
export declare function filterSuppressedDiagnostics(diagnostics: Diagnostic[], directives: Map<number, Set<string>>): Diagnostic[];
type DeclKind = 'var' | 'fn' | 'class';
/** Classify whether an identifier was declared as a function, class, or variable. */
export declare function classifyDeclarationType(program: any, identName: string): DeclKind;
export {};
//# sourceMappingURL=diagnostics.d.ts.map