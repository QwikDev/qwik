/**
 * Public entry point for the Qwik optimizer.
 *
 * transformModule() accepts TransformModulesOptions and returns TransformOutput,
 * wiring together extraction, capture analysis, variable migration, parent
 * rewriting, and segment codegen into a single public API matching the NAPI
 * binding interface.
 */
import type { TransformModulesOptions, TransformOutput } from "./types.js";
/**
 * Transform Qwik source modules by extracting segments, rewriting the parent
 * module, and generating segment module code.
 *
 * This is the public API consumed by the Qwik Vite plugin, matching the NAPI
 * binding interface.
 *
 * Pipeline per input file:
 *   repair -> extract -> analyze captures -> migrate -> rewrite parent -> generate segments
 */
export declare function transformModule(options: TransformModulesOptions): TransformOutput;
//# sourceMappingURL=transform.d.ts.map