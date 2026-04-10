# Technology Stack

**Project:** Qwik Optimizer (TypeScript)
**Researched:** 2026-04-10

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

**Confidence: HIGH** (verified from Qwik optimizer Rust source code)

The SWC optimizer generates symbol hashes using this exact algorithm:

```rust
// From packages/qwik/src/optimizer/core/src/transform.rs
let mut hasher = DefaultHasher::new();  // = SipHash-1-3 with keys (0, 0)
let local_file_name = options.path_data.rel_path.to_slash_lossy();
if let Some(scope) = options.scope {
    hasher.write(scope.as_bytes());   // raw bytes, no length prefix
}
hasher.write(local_file_name.as_bytes());  // raw bytes, no length prefix
hasher.write(display_name.as_bytes());     // raw bytes, no length prefix
let hash = hasher.finish();               // u64

// Base64 encoding
fn base64(nu: u64) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(nu.to_le_bytes())         // little-endian 8 bytes
        .replace(['-', '_'], "0")         // replace - and _ with 0
}
```

**To replicate in TypeScript:**

1. Use the `siphash` npm package's SipHash-1-3 variant (`lib/siphash13.js`)
2. Key = `[0, 0, 0, 0]` (128-bit key of all zeros, represented as 4x32-bit)
3. Feed bytes: optional scope + relative path (forward-slash normalized) + display name
4. Get u64 result, encode as little-endian 8 bytes
5. Base64url-encode (no padding), replace `-` and `_` with `0`

**WARNING:** Rust's `Hasher::write` feeds raw byte slices directly into SipHash state with NO length prefix and NO separator between successive writes. The JS implementation must concatenate bytes identically -- `scope_bytes + path_bytes + name_bytes` as one continuous byte stream fed into SipHash-1-3.

**Verification:** Test against known snapshot hashes. E.g., for `test.tsx` with display name `renderHeader1`, the expected hash is `jMxQsjbyDss`.

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

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

### Package Config

```jsonc
// package.json (key fields)
{
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "engines": { "node": ">=20" }
}
```

## Installation

```bash
# Core dependencies
npm install oxc-parser oxc-transform oxc-walker magic-string siphash pathe

# Dev dependencies
npm install -D vitest typescript fast-deep-equal
```

Note: `fast-deep-equal` is dev-only because it is only used in test comparison utilities, not in the optimizer itself.

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
