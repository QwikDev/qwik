# External Integrations

**Analysis Date:** 2026-01-24

## APIs & External Services

**Cloud Platform SDKs:**
- Azure Static Web Apps
  - SDK: `@azure/functions` 3.5.1
  - Middleware: `packages/qwik-router/src/middleware/azure-swa/index.ts`
  - Adapter: `packages/qwik-router/src/adapters/azure-swa/vite/index.ts`

- Netlify Edge Functions
  - SDK: `@netlify/edge-functions` 2.17.0
  - Middleware: `packages/qwik-router/src/middleware/netlify-edge/index.ts`
  - Adapter: `packages/qwik-router/src/adapters/netlify-edge/vite/index.ts`

- AWS Lambda
  - SDK: Built-in (via Node.js runtime)
  - Middleware: `packages/qwik-router/src/middleware/aws-lambda/index.ts`

- Google Cloud Run
  - Adapter: `packages/qwik-router/src/adapters/cloud-run/vite/index.ts`

- Vercel Edge
  - Adapter: `packages/qwik-router/src/adapters/vercel-edge/vite/index.ts`
  - Middleware: `packages/qwik-router/src/middleware/vercel-edge/index.ts`

- Cloudflare Pages
  - Adapter: `packages/qwik-router/src/adapters/cloudflare-pages/vite/index.ts`
  - Middleware: `packages/qwik-router/src/middleware/cloudflare-pages/index.ts`

**Authentication:**
- Supabase
  - Packages: `@supabase/supabase-js` 2.53.0, `@supabase/ssr` 0.6.1
  - Helper library: `supabase-auth-helpers-qwik` 0.0.3
  - Implementation: `packages/supabase-auth-helpers-qwik/src/utils/createServerClient.ts`
  - Usage: Cookie-based authentication integration with `@qwik.dev/router` RequestEvent
  - Env vars required: `SUPABASE_URL`, `SUPABASE_KEY` (configured in individual app)

## Data Storage

**Databases:**
- No direct ORM dependencies in core
- Supabase (PostgreSQL) - Via `@supabase/supabase-js` integration
  - Client creation: `createServerClient()` function
  - Cookie management: Automatic via request/response context

**File Storage:**
- Local filesystem only in core framework
- Cloud storage via platform adapters (Netlify, Vercel, Azure, etc.)

**Caching:**
- None enforced in core framework
- Vite build caching for development
- Platform-level caching (CDN) through deployment adapters

## Authentication & Identity

**Auth Provider:**
- Supabase (primary integration)
  - Implementation: `packages/supabase-auth-helpers-qwik/`
  - Pattern: Server-side cookie-based auth with `createServerClient()`
  - Cookie handling: Automatic via `RequestEventBase.cookie`

- Custom Auth Support
  - Can be implemented via middleware and request handlers
  - Cookie and header management available through `RequestEvent`

## Monitoring & Observability

**Error Tracking:**
- Not integrated in core framework
- Developers can integrate via middleware or server handlers

**Logs:**
- Standard console API for logging
- Platform-specific logging via deployment adapters (CloudWatch, Stackdriver, etc.)

## CI/CD & Deployment

**Hosting Platforms:**
- Multi-platform support via adapters:
  - Node.js server (Express-compatible)
  - Edge platforms: Cloudflare Pages, Netlify Edge, Vercel Edge
  - Serverless: AWS Lambda, Azure Static Web Apps, Google Cloud Run
  - Alternative runtimes: Bun, Deno
  - Static site generation (SSG/SSR)

**CI Pipeline:**
- GitHub Actions
  - Configuration: `.github/workflows/ci.yml`
  - Workflow: Build → Lint → Test → Release
  - Caching: Artifact caching for qwik, rust, docs, insights, unit tests, e2e tests, CLI e2e tests
  - NPM dist-tags: dev, next, latest
  - Triggers: Pull requests, pushes to main/upcoming/next/build/* branches, manual workflow dispatch

**Build System:**
- Vite 7.3.1 as primary build tool
- Rollup 4.55.1 for bundling
- Esbuild 0.27.2 for transpilation
- Rust toolchain for optimizer compilation (wasm32-unknown-unknown target)

**Package Registry:**
- npm registry publishing
- Changesets for version management and changelog
- GitHub release creation on publish

## Environment Configuration

**Required env vars (per deployment):**
- `SUPABASE_URL` - Supabase project URL (if using auth helpers)
- `SUPABASE_KEY` - Supabase public key (if using auth helpers)
- Platform-specific credentials (AWS, Azure, Netlify, Vercel keys)

**Development env:**
- `.envrc` - Nix flake for reproducible dev environment
- `flake.nix` - Node 24, Rust toolchain, Playwright browsers, wasm-pack

**Secrets location:**
- GitHub Secrets for CI/CD (`.github/workflows/ci.yml`)
- Platform-specific secret management (Netlify, Vercel, AWS, Azure dashboards)
- `.env` files (not committed) for local development

## Webhooks & Callbacks

**Incoming:**
- Not exposed in core framework
- Can be implemented via `requestHandler()` in `packages/qwik-router/src/middleware/request-handler/`
- Platform-specific webhook endpoints for deployment triggers

**Outgoing:**
- Supabase webhook support available via `@supabase/supabase-js` client
- Implementation: Via server-side handlers with Supabase client
- Set-cookie-parser integration for response header management

## Request/Response Handling

**Standard Interfaces:**
- `RequestEventBase` - Base request/response event interface; `packages/qwik-router/src/runtime/` and middleware
- `ServerRequestEvent` - Extended request interface for middleware
- `ServerRenderOptions` - Rendering configuration
- Cookie management: `RequestEventBase.cookie.getAll()`, `RequestEventBase.cookie.set()`
- Header manipulation: Via response headers object

**Content Negotiation:**
- Markdown processing via `marked` 12.0.2 and unified ecosystem
- MDX support via `@mdx-js/mdx` 3.1.1
- Image optimization via `vite-imagetools` 9.0.0

---

*Integration audit: 2026-01-24*
