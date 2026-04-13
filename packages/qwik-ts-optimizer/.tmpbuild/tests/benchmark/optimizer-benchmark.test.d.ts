/**
 * BENCH-01: Full monorepo benchmark — SWC vs TS optimizer
 * BENCH-02: Worst-case single file benchmark — SWC vs TS optimizer
 *
 * These benchmarks compare the TS optimizer against the native SWC optimizer
 * on real Qwik source files. They serve as CI-enforceable regression gates:
 *
 *   - Monorepo: TS must be within 1.15x of SWC wall time
 *   - Single file: TS must be within 1.5x of SWC wall time
 *
 * Usage:
 *   npx vitest run tests/benchmark/optimizer-benchmark.test.ts
 *
 * These tests are wrapped in describe.skip so they do NOT run during
 * the normal `npx vitest run` invocation. To run them explicitly:
 *   npx vitest run tests/benchmark/optimizer-benchmark.test.ts --no-file-parallelism
 * and remove the .skip or use: BENCH=1 npx vitest run tests/benchmark/
 */
export {};
//# sourceMappingURL=optimizer-benchmark.test.d.ts.map