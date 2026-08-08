/**
 * Native implementations (specs/09).
 *
 * `native$` marks a function that non-JS engines can run themselves. The JS implementation stays
 * the source of truth — it is what runs in the browser and in the JS SSR engine — while the
 * per-target sources let a native engine call the function without a JS runtime. The compiler reads
 * the marker at build time and strips it from the emitted module.
 *
 * The key names the target language, so any engine can be addressed:
 *
 * ```ts
 * export const double = native$((value: number) => value * 2, {
 *   rust: nativeCode`pub fn double(args: &[Rc<SerdesValue>]) -> Rc<SerdesValue> { … }`,
 *   go: nativeFile('./double.go'),
 * });
 * ```
 */

/** A target implementation, authored inline with `nativeCode` or as a sidecar via `nativeFile`. */
export interface NativeSource {
  /** Inline source text. */
  readonly source?: string;
  /** Path to a sidecar file, relative to the module declaring it. */
  readonly file?: string;
}

/** Target language name (`rust`, `go`, …) to its implementation. */
export type NativeTargets = Record<string, NativeSource>;

/**
 * Inline target source. Interpolation is rejected at compile time: the compiler reads the text
 * statically, so the template can only hold literal source.
 */
export const nativeCode = (source: TemplateStringsArray, ...values: unknown[]): NativeSource => {
  if (values.length > 0) {
    throw new Error('nativeCode`` does not support interpolation');
  }
  return { source: source[0] };
};

/** Target source kept in a sidecar file next to the module. */
export const nativeFile = (file: string): NativeSource => ({ file });

/**
 * Declares native implementations for `impl`. Returns the JS implementation unchanged, so the
 * function behaves identically whether or not a native engine is in play.
 */
export const native$ = <TYPE extends Function>(impl: TYPE, targets: NativeTargets): TYPE => {
  void targets;
  return impl;
};
