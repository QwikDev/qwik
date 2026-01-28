# Technology Stack

**Analysis Date:** 2026-01-24

## Languages

**Primary:**
- TypeScript 5.9.3 - Core framework, plugins, adapters, and build tools; `packages/qwik/src`, `packages/qwik-router/src`
- JavaScript (ESNext) - Build output and runtime; `.mjs` and `.js` outputs
- Rust - Optimizer core and NAPI bindings; `packages/qwik/src/optimizer/core`, `packages/qwik/src/napi`

**Secondary:**
- MDX 3.1.1 - Content in `packages/docs` and `packages/qwik-router` for markdown with JSX
- YAML - Configuration in `packages/qwik-router/src` for markdown frontmatter and build configs

## Runtime

**Environment:**
- Node.js >= 18.17.0 || >= 20.3.0 || >= 21.0.0 (per `package.json` engines)
- Rust toolchain with wasm32-unknown-unknown target for optimizer compilation
- Bun, Deno optional runtimes for server adapters

**Package Manager:**
- pnpm 10.17.1+ (strictly enforced in `package.json` with preinstall script `only-allow pnpm`)
- Lockfile: present (`pnpm-lock.yaml`)
- Node 24 in development environment (via flake.nix)

## Frameworks

**Core:**
- Qwik (@qwik.dev/core 2.0.0-beta.17) - Main reactive framework; `packages/qwik/src`
- Qwik Router (@qwik.dev/router 2.0.0-beta.17) - File-based routing and adapters; `packages/qwik-router/src`
- Qwik React (@qwik.dev/react 2.0.0-beta.17) - React interop layer; `packages/qwik-react/src`

**Testing:**
- Vitest 4.0.16 - Unit test framework; `vitest.config.ts`
- Playwright 1.57.0 - E2E testing; `starters/playwright.config.ts`
- UVU 0.5.6 - Testing utility for router tests

**Build/Dev:**
- Vite 7.3.1 (peer dep >=5 <8) - Build tool and dev server
- Rollup 4.55.1 - Bundle optimization and plugins
- Esbuild 0.27.2 - Fast build and minification
- ts-morph 27.0.2 - AST manipulation for code generation

**Packaging/Release:**
- Changesets 2.29.5 - Monorepo versioning and changelog management
- API Extractor 7.55.2 - TypeScript API documentation extraction
- API Documenter 7.28.2 - API reference generation

## Key Dependencies

**Critical:**
- Vite 7.3.1 - Build system foundation, supports multiple environments (Cloudflare, Azure, Netlify, Vercel, AWS Lambda, Deno, Bun, Node)
- TypeScript 5.9.3 - Type safety and language support
- Rollup 4.55.1 - Module bundling and code splitting
- esbuild 0.27.2 - Fast transpilation and minification

**Infrastructure:**
- csstype 3.2.3 - TypeScript types for CSS
- Prettier 3.7.4 - Code formatting with plugins for Tailwind CSS and JSDoc
- ESLint 9.39.2 with typescript-eslint 8.52.0 - Code linting and style checking
- Zod 3.25.48 - Schema validation in router and core
- Valibot >=0.36.0 <2 - Alternative validation library in router
- marked 12.0.2 - Markdown parsing for documentation

**Markdown/Documentation:**
- @mdx-js/mdx 3.1.1 - MDX processing for docs
- remark-gfm 4.0.1 - GitHub-flavored markdown support
- remark-frontmatter 5.0.0 - Markdown frontmatter parsing
- rehype-autolink-headings 7.1.0 - Auto-link header generation
- refractor 4.8.1 - Syntax highlighting
- vfile 6.0.3 - Virtual file format for AST processing

**Platform Support:**
- @azure/functions 3.5.1 - Azure Static Web Apps adapter
- @netlify/edge-functions 2.17.0 - Netlify Edge Functions adapter
- set-cookie-parser 2.7.2 - Cookie parsing for middleware

**Image Processing:**
- vite-imagetools 9.0.0 - Image optimization and transformation via Vite
- imagetools-core 9.0.0 - Underlying image processing library
- image-size 1.2.1 - Image dimension detection

**Utilities:**
- kleur 4.1.5 - Terminal color output for CLI
- source-map 0.7.6 - Source map utilities
- svgo 3.3.2 - SVG optimization
- Launch Editor 2.12.0 - IDE editor launching for dev error messages

## Configuration

**Environment:**
- `.envrc` - Nix flake configuration using `use flake` and `watch_file`
- TypeScript paths aliases in `tsconfig.json`:
  - `@qwik-client-manifest`: Qwik client manifest generation
  - `@qwik-router-config`: Router configuration
  - `@qwik-router-sw-register`: Service worker registration
  - `@qwik-router-sw-register-build`: Build-time SW registration

**Build:**
- `tsconfig.json` - Root TypeScript config with ESNext target, module resolution Bundler
- `vitest.config.ts` - Unit test runner configuration with qwikVite plugin
- `vite.config.ts` in packages - Per-package build configuration
- `prettier.config.*` - Code formatting with plugins for Tailwind and JSDoc
- `.eslintrc.mjs` - ESLint configuration using flat config format

**Package Structure:**
- `pnpm-workspace.yaml` - Monorepo workspace definition
- Syncpack configuration in root `package.json` for dependency version management
- Workspace protocol (`workspace:*`, `workspace:^`) for internal package references

## Platform Requirements

**Development:**
- Node.js 22.18.0+ (recommended)
- Rust toolchain (via rustup or nix flake)
- WebAssembly build tools (wasm-pack)
- Playwright browsers (via npm or nix flake)
- Git for version control and changesets

**Production:**
- Multi-target deployment support:
  - Node.js-based servers (Express)
  - Edge platforms (Cloudflare Pages, Netlify Edge, Vercel Edge)
  - Serverless (AWS Lambda, Azure Static Web Apps, Google Cloud Run)
  - Alternative runtimes (Bun, Deno)
  - Static site generation (SSG/SSR)

**Deployment:**
- GitHub Actions CI/CD (`.github/workflows/ci.yml`)
- Changesets-based release automation
- npm registry publishing with dist-tags (dev, next, latest)

---

*Stack analysis: 2026-01-24*
