# Vite Environment API Research Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Research how frameworks have implemented the Vite Environment API to inform Qwik's migration strategy for rewriting the qwik and qwik-router vite plugins.

**Architecture:** The Vite Environment API (introduced in Vite 6) allows frameworks to define multiple isolated module graphs and execution environments (client, SSR, custom workers, etc.) within a single Vite server. This replaces the previous `ssr` boolean approach with a more flexible system.

**Tech Stack:** Vite 6+, TypeScript, grep.app MCP server for code discovery

---

## Background: Current Qwik Vite Plugin Architecture

The current Qwik vite plugins are located at:

- **Main Qwik Plugin:** `packages/qwik/src/optimizer/src/plugins/vite.ts`
- **Qwik Router Plugin:** `packages/qwik-router/src/buildtime/vite/plugin.ts`

Key characteristics of current implementation:

- Uses `viteConfig.build?.ssr` boolean to determine target (client vs ssr)
- Separate build passes for client and SSR
- Custom optimizer integration via `createQwikPlugin()`
- Module transformation via `transform` hook
- HMR via `handleHotUpdate` hook
- Dev middleware for SSR in `configureServer`

---

## Research Tasks

### Task 1: Study Vite's Core Environment API Types

**Goal:** Understand the foundational types and APIs provided by Vite.

**Search Queries (grep.app):**

```
Query: "DevEnvironment"
Language: TypeScript
Repo: vitejs/vite
```

```
Query: "EnvironmentModuleGraph"
Language: TypeScript
Repo: vitejs/vite
```

```
Query: "createEnvironment"
Language: TypeScript
Repo: vitejs/vite
```

**Key Files to Study:**

- `packages/vite/src/node/server/environment.ts` - DevEnvironment class
- `packages/vite/src/node/server/moduleGraph.ts` - EnvironmentModuleGraph class
- `packages/vite/src/node/config.ts` - Environment configuration types
- `packages/vite/src/node/server/environments/runnableEnvironment.ts` - RunnableDevEnvironment
- `packages/vite/src/node/server/environments/fetchableEnvironments.ts` - FetchableDevEnvironment

**Document:**

- [ ] `DevEnvironment` class API and lifecycle
- [ ] `EnvironmentModuleGraph` vs old `ModuleGraph`
- [ ] `createEnvironment` hook signature
- [ ] `ModuleRunner` and `ModuleRunnerTransport` concepts
- [ ] How `environments` config object works

---

### Task 2: Study Nitro's Implementation (Nuxt/UnJS)

**Goal:** Nitro has a mature implementation for server-side rendering with workerd support.

**Search Queries (grep.app):**

```
Query: "extends DevEnvironment"
Language: TypeScript
Repo: nitrojs/nitro
```

```
Query: "createFetchableDevEnvironment"
Language: TypeScript
Repo: nitrojs/nitro
```

**Key Files:**

- `src/build/vite/env.ts` - Environment configuration
- `src/build/vite/dev.ts` - FetchableDevEnvironment extension

**Document:**

- [ ] How Nitro defines custom environments
- [ ] FetchableDevEnvironment pattern for request handling
- [ ] Hot channel and transport configuration
- [ ] Integration with workerd runtime

---

### Task 3: Study Nuxt's Implementation

**Goal:** Nuxt has experimental viteEnvironmentApi support.

**Search Queries (grep.app):**

```
Query: "environments:"
Language: TypeScript
Repo: nuxt/nuxt
Path: vite
```

```
Query: "experimental.viteEnvironmentApi"
Language: TypeScript
Repo: nuxt/nuxt
```

**Key Files:**

- `packages/vite/src/vite.ts` - Main vite configuration

**Document:**

- [ ] How Nuxt configures client and ssr environments
- [ ] Consumer type configuration (`client` vs default)
- [ ] Warmup configuration per environment
- [ ] Feature flag approach (`experimental.viteEnvironmentApi`)

---

### Task 4: Study Cloudflare Workers Plugin

**Goal:** Cloudflare has a sophisticated custom DevEnvironment for Workers.

**Search Queries (grep.app):**

```
Query: "CloudflareDevEnvironment"
Language: TypeScript
Repo: cloudflare/workers-sdk
```

```
Query: "extends DevEnvironment"
Language: TypeScript
Repo: cloudflare/workers-sdk
```

```
Query: "ModuleRunner"
Language: TypeScript
Repo: cloudflare/workers-sdk
```

**Key Files:**

- `packages/vite-plugin-cloudflare/src/cloudflare-environment.ts` - Custom environment
- `packages/vite-plugin-cloudflare/src/workers/runner-worker/module-runner.ts` - Module runner in worker

**Document:**

- [ ] Custom DevEnvironment subclass pattern
- [ ] How ModuleRunner runs inside Workers
- [ ] Build environment vs dev environment setup
- [ ] Environment name validation/transformation

---

### Task 5: Study hi-ogawa's vite-environment-examples

**Goal:** This repository contains multiple reference implementations.

**Search Queries (grep.app):**

```
Query: "extends DevEnvironment"
Language: TypeScript
Repo: hi-ogawa/vite-environment-examples
```

**Key Examples:**

- `examples/child-process/` - ChildProcessFetchDevEnvironment
- `packages/workerd/` - WorkerdDevEnvironment

**Document:**

- [ ] Child process environment pattern
- [ ] Bridge server for cross-process communication
- [ ] Workerd integration patterns
- [ ] Test environment setup

---

### Task 6: Study Vitest's Implementation

**Goal:** Vitest uses module runner for test isolation.

**Search Queries (grep.app):**

```
Query: "ModuleRunner"
Language: TypeScript
Repo: vitest-dev/vitest
```

```
Query: "environment.moduleGraph"
Language: TypeScript
Repo: vitest-dev/vitest
```

**Key Files:**

- `packages/vitest/src/runtime/moduleRunner/` - Custom module runner
- `packages/vitest/src/node/environments/fetchModule.ts` - Module fetching

**Document:**

- [ ] How Vitest extends ModuleRunner
- [ ] EvaluatedModules tracking
- [ ] Test isolation patterns
- [ ] VM context integration

---

### Task 7: Study VitePress Implementation

**Goal:** VitePress uses environment API for HMR and module graph.

**Search Queries (grep.app):**

```
Query: "this.environment.moduleGraph"
Language: TypeScript
Repo: vuejs/vitepress
```

```
Query: "hotUpdate"
Language: TypeScript
Repo: vuejs/vitepress
```

**Key Files:**

- `src/node/plugin.ts` - Main plugin with environment usage
- `src/node/plugins/dynamicRoutesPlugin.ts` - Dynamic routes with module graph
- `src/node/plugins/staticDataPlugin.ts` - Static data with HMR

**Document:**

- [ ] `this.environment` access pattern in hooks
- [ ] Module invalidation via `environment.moduleGraph.invalidateModule()`
- [ ] Full reload trigger via `environment.hot.send()`
- [ ] Per-environment module resolution

---

### Task 8: Study Astro's Implementation

**Goal:** Astro has complex multi-environment needs (client, server, islands).

**Search Queries (grep.app):**

```
Query: "handleHotUpdate"
Language: TypeScript
Repo: withastro/astro
```

```
Query: "moduleGraph"
Language: TypeScript
Repo: withastro/astro
```

**Key Files:**

- `packages/astro/src/vite-plugin-astro/` - Core Astro plugin
- `packages/astro/src/vite-plugin-scanner/` - Scanner plugin

**Document:**

- [ ] How Astro handles multiple output targets
- [ ] Island architecture environment needs
- [ ] HMR strategy for `.astro` files

---

### Task 9: Analyze Qwik-Specific Requirements

**Goal:** Identify what Qwik needs that may be unique.

**Files to Analyze:**

- `packages/qwik/src/optimizer/src/plugins/vite.ts`
- `packages/qwik/src/optimizer/src/plugins/plugin.ts`
- `packages/qwik-router/src/buildtime/vite/plugin.ts`

**Document:**

- [ ] Qwik optimizer integration points
- [ ] QRL extraction and transformation needs
- [ ] Segment/hoist entry strategy handling
- [ ] Manifest generation requirements
- [ ] Dev SSR server middleware
- [ ] Client/SSR module graph separation needs

---

### Task 10: Create Migration Strategy Document

**Goal:** Synthesize research into actionable migration plan.

**Sections to Write:**

1. **Environment Definitions for Qwik**
   - `client` environment configuration
   - `ssr` environment configuration
   - Potential `qrl` or `worker` environments

2. **Module Graph Changes**
   - Migration from `server.moduleGraph` to `environment.moduleGraph`
   - Per-environment module tracking for QRLs

3. **Build Pipeline Changes**
   - How to use `environments` in build config
   - Manifest generation per environment
   - Entry strategy per environment

4. **Dev Server Changes**
   - Custom DevEnvironment subclass for Qwik?
   - SSR middleware integration
   - HMR strategy updates

5. **Plugin Hook Updates**
   - Hooks that need environment-awareness
   - `hotUpdate` vs `handleHotUpdate` migration
   - `this.environment` access patterns

6. **Breaking Changes & Migration Path**
   - User-facing API changes
   - Deprecation strategy
   - Feature flag approach (like Nuxt)

---

## Research Output Format

For each framework studied, create a summary with:

```markdown
## [Framework Name]

### Environment Configuration

- How environments are defined
- Custom environment classes used

### Key Patterns

- Notable implementation patterns
- Unique solutions to common problems

### Relevant to Qwik

- Patterns that apply to Qwik's needs
- Differences to account for

### Code References

- File paths and line numbers for key implementations
```

---

## Deliverables

1. **Research Notes:** Detailed notes from each task in `docs/research/vite-environment-api/`
2. **Pattern Catalog:** Common patterns across frameworks
3. **Qwik Migration RFC:** Proposal for Qwik's Environment API adoption
4. **Implementation Plan:** Task-by-task plan for the actual migration

---

## grep.app Search Tips

Use the MCP grep server with these patterns:

```typescript
// Find environment configurations
mcp__grep__searchGitHub({
  query: 'environments:',
  language: ['TypeScript'],
  path: 'vite.config',
});

// Find custom DevEnvironment classes
mcp__grep__searchGitHub({
  query: 'extends DevEnvironment',
  language: ['TypeScript'],
});

// Find module graph usage
mcp__grep__searchGitHub({
  query: 'environment.moduleGraph',
  language: ['TypeScript'],
});

// Find ModuleRunner implementations
mcp__grep__searchGitHub({
  query: 'ModuleRunner',
  language: ['TypeScript'],
  repo: 'specific/repo',
});

// Find createEnvironment hooks
mcp__grep__searchGitHub({
  query: 'createEnvironment(',
  language: ['TypeScript'],
});
```

---

## Key Questions to Answer

1. **Should Qwik create custom DevEnvironment subclasses?**
   - Cloudflare and Nitro do this for custom runtimes
   - Qwik may need this for optimizer integration

2. **How should QRL transformation work per-environment?**
   - Client needs different QRL resolution than SSR
   - May need environment-specific transform logic

3. **How to handle the manifest across environments?**
   - Currently generated in client build, consumed in SSR
   - Environment API may change this flow

4. **What's the HMR strategy for Qwik components?**
   - Current: full reload on most changes
   - Could environment API enable better HMR?

5. **How to integrate with qwik-router?**
   - Router has its own virtual modules
   - Needs coordination with qwik plugin environments

---

## Timeline Estimate

- Tasks 1-3: Core Vite + Nitro + Nuxt research
- Tasks 4-6: Cloudflare + Examples + Vitest research
- Tasks 7-8: VitePress + Astro research
- Tasks 9-10: Qwik analysis + Migration strategy

---

## References

- [Vite Environment API RFC](https://github.com/vitejs/vite/discussions/16358)
- [Vite 6.0 Release Notes](https://vite.dev/blog/announcing-vite6)
- [Environment API Guide](https://vite.dev/guide/api-environment.html)
- [hi-ogawa/vite-environment-examples](https://github.com/hi-ogawa/vite-environment-examples)
