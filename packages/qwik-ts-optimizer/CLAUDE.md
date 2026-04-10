<!-- GSD:project-start source:PROJECT.md -->
## Project

**Qwik Optimizer (TypeScript)**

A drop-in TypeScript replacement for Qwik's Rust/SWC optimizer. It takes Qwik source files containing `$()` boundaries and extracts segments (lazy-loadable closures), computes captures, generates QRLs, and emits transformed output. Consumed as a library function by Qwik core's existing Vite plugin.

**Core Value:** The optimizer must produce output that is runtime-identical to the SWC optimizer — same segments extracted, same captures computed, same hashes generated — so existing Qwik apps work without changes.

### Constraints

- **API compatibility**: Must be a drop-in replacement for the NAPI module — same function signature, same output shape
- **Hash stability**: Must use the same hash algorithm as SWC optimizer so QRL references resolve correctly
- **Runtime correctness**: Output must produce working Qwik apps — hydration, lazy-loading, segment resolution all functional
- **No double codebase**: Single TS implementation, not a parallel system alongside SWC
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Framework (Already Decided)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | ~5.7+ | Implementation language | Team expertise, AI-assisted dev works better with TS on ESTree |
| Node.js | 20+ LTS | Runtime | LTS stability, native ESM support, required for NAPI bindings |
### Parser and AST (Already Decided)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| oxc-parser | ^0.124.0 | Parse TS/TSX/JS/JSX to ESTree AST | Native Rust via NAPI, ~100x faster than Babel, ESTree-conformant output |
| oxc-transform | ^0.121.0 | Strip TypeScript syntax | Native Rust, 40x faster than Babel, same oxc ecosystem |
| oxc-walker | ^0.6.0 | AST traversal with scope tracking | Pure JS, ScopeTracker for declaration/reference tracking, `walk()` with enter/leave |
| magic-string | ^0.30.21 | Surgical source text replacement | Avoids full AST-to-code reprint; used by Vite/Rollup; source map support if needed later |
### Hashing (Critical: Must Match SWC Optimizer)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| siphash | ^1.1.0 | SipHash-1-3 for deterministic symbol hashes | **Must replicate Rust's `DefaultHasher`** (see Hash Algorithm section below) |
### Testing
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| vitest | ^4.1.4 | Test runner and assertions | Fast, ESM-native, watch mode, built-in coverage, same ecosystem as Vite |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| oxc-parser | (same) | Re-parse expected/actual output for AST comparison | In test utilities: parse both strings, compare ASTs structurally |
| fast-deep-equal | ^3.1.3 | Deep structural equality for AST node comparison | In test utilities: compare cleaned AST trees after stripping positions/ranges |
| pathe | ^2.0.3 | Cross-platform path manipulation | Normalizing file paths to forward-slash (matching Rust's `to_slash_lossy()`) |
## Hash Algorithm: Critical Implementation Detail
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Parser | oxc-parser | @babel/parser | 100x slower, heavier dependency tree, Babel AST not ESTree-standard |
| Parser | oxc-parser | acorn + acorn-jsx + acorn-typescript | Slower, TS support is a plugin with gaps, no native binding |
| AST walker | oxc-walker | estree-walker | oxc-walker wraps estree-walker but adds ScopeTracker which we need |
| AST walker | oxc-walker | @babel/traverse | Babel-AST only, heavy, not ESTree-compatible |
| Codegen | magic-string | astring / escodegen | These reprint from AST (lossy formatting); magic-string preserves original text |
| Codegen | magic-string | @babel/generator | Babel-AST only, heavier, not needed with text-replacement approach |
| Hashing | siphash (JS) | Node crypto SHA-256 | Wrong algorithm; must match Rust DefaultHasher = SipHash-1-3 |
| Hashing | siphash (JS) | murmurhash | Wrong algorithm; Rust uses SipHash, not MurmurHash |
| Hashing | siphash (JS) | Custom SipHash impl | Unnecessary; `siphash` npm package by jedisct1 (SipHash co-author) is authoritative |
| Testing | vitest | jest | Slower, CJS-first, worse ESM support, heavier config |
| AST comparison | oxc-parser re-parse + deep-equal | compare-ast (npm) | compare-ast uses acorn internally; we already have oxc-parser |
| Deep equal | fast-deep-equal | deep-equal | fast-deep-equal is ~7x faster, zero dependencies |
| Path utils | pathe | path (Node built-in) | pathe normalizes to forward-slash by default; Node path is OS-dependent |
## What NOT to Use
| Library | Why Not |
|---------|---------|
| @babel/* (anything) | Wrong AST format (Babel AST vs ESTree), heavy, slow. The entire point of choosing oxc is to avoid Babel. |
| estraverse / estraverse-fb | Obsolete; oxc-walker handles traversal with scope tracking built in |
| recast | Designed for print-preserving AST transforms; magic-string is simpler for our text-replacement approach |
| jscodeshift | Facebook's codemod framework; overkill, uses recast+Babel internally |
| source-map (npm) | Not needed yet (source maps deferred per PROJECT.md). When needed, magic-string generates them natively. |
| typescript (compiler API) | 60MB+ dependency just to parse; oxc-parser + oxc-transform handle parsing and TS stripping |
| acorn-walk | Would need separate scope tracking; oxc-walker bundles ScopeTracker |
## Project Configuration
### TypeScript Config
### Package Config
## Installation
# Core dependencies
# Dev dependencies
## Confidence Assessment
| Component | Confidence | Rationale |
|-----------|------------|-----------|
| oxc-parser | HIGH | Already decided in PROJECT.md; verified current on npm (0.124.0) |
| oxc-transform | HIGH | Already decided; verified current (0.121.0); same oxc ecosystem |
| oxc-walker | HIGH | Already decided; verified current (0.6.0); ScopeTracker confirmed |
| magic-string | HIGH | Already decided; verified current (0.30.21); battle-tested in Vite |
| siphash | HIGH | Algorithm verified from Qwik Rust source; jedisct1's package is by SipHash co-author; SipHash-1-3 variant available |
| vitest | HIGH | Already decided; verified current (4.1.4) |
| fast-deep-equal | HIGH | Widely used (billions of downloads), stable API, zero-dep |
| pathe | MEDIUM | Convenience over manual `.replace(/\\/g, '/')` -- could use a one-liner instead, but pathe handles edge cases |
| Project config (ESM/NodeNext) | HIGH | Standard 2025/2026 TS project setup, verified from TS docs |
## Sources
- [oxc-parser npm](https://www.npmjs.com/package/oxc-parser) - v0.124.0
- [oxc-transform npm](https://www.npmjs.com/package/oxc-transform) - v0.121.0
- [oxc-walker npm](https://www.npmjs.com/package/oxc-walker) - v0.6.0
- [oxc-walker GitHub](https://github.com/oxc-project/oxc-walker) - API reference
- [magic-string npm](https://www.npmjs.com/package/magic-string) - v0.30.21
- [siphash-js GitHub](https://github.com/jedisct1/siphash-js) - SipHash-1-3 variant
- [Rust DefaultHasher source](https://doc.rust-lang.org/src/std/hash/random.rs.html) - Confirmed SipHash-1-3 with keys (0,0)
- [Qwik optimizer transform.rs](https://github.com/QwikDev/qwik/blob/main/packages/qwik/src/optimizer/core/src/transform.rs) - Hash algorithm source
- [vitest npm](https://www.npmjs.com/package/vitest) - v4.1.4
- [TypeScript module docs](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html) - NodeNext config
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
