---
name: qwik-docs-development
description: Use when writing, modifying, or reviewing Qwik docs content or docs-site code under packages/docs, including docs routes, MDX content, generated LLM outputs, docs build behavior, or docs-specific e2e tests.
---

# Qwik Docs Development

Use this skill for `packages/docs/**` work. Keep the repo-wide rules from `.ruler/AGENTS.md` in
force.

## Fast Path

1. Identify whether the change is docs content, route/layout code, API docs surfacing, generated LLM
   output, search/indexing, or deployment behavior.
2. For docs content, follow the writing style below before changing site mechanics.
3. For existing docs pages already in the LLM manifest, edit source content and regenerate only when
   verification requires generated output.
4. For new pages that should appear in LLM outputs, update the curated manifest in
   `packages/docs/scripts/generate-llms.ts`.
5. When editing docs scripts, keep generation deterministic and add focused unit coverage for parser,
   path, URL, or output-shape behavior.
6. Prefer docs-specific commands from `packages/docs/package.json`.

## Writing Style

Write Qwik docs for readers who are learning the concept while solving a concrete task.

- Start with the user need and the Qwik concept in one or two plain paragraphs.
- Split the page into short sections named after the concept or API, such as `useSignal()`,
  `Passing signals to child components`, or `Nested objects and arrays`.
- Explain the default case first, then reveal deeper, less common, or higher-cost cases later, this is done in a note block. There is short and long form notes in MDX.
- Use complete, minimal examples with current v2 imports from `@qwik.dev/core`.
- After each example, state what the example created or changed and what Qwik tracks, updates, or
  serializes.
- Prefer direct sentences over marketing claims or framework jargon. Define Qwik-specific terms
  before relying on them.
- Use notes sparingly for important mental models, tradeoffs, or pitfalls, such as avoiding store
  destructuring or using `function` when a store method needs `this`.
- Keep examples small enough to scan, but complete enough to paste into a demo or fixture.
- Link demos after the core explanation; do not make the link carry the explanation.

## Content Pattern

For concept docs, use this shape unless the page has a better existing local pattern:

1. State the problem and divide the concept into the two or three choices users need to understand.
2. Show the simplest API with a complete code example.
3. Explain the important variable or object in the example in one short paragraph.
4. Add a sharing, nesting, async, or advanced section only after the default case is clear.
5. Include a short note for automatic tracking, serialization, or performance tradeoffs when that
   knowledge prevents common mistakes.

## Source Map

- Docs routes and MDX: `packages/docs/src/routes/`
- Docs components: `packages/docs/src/components/`
- LLM generator: `packages/docs/scripts/generate-llms.ts`
- Docs e2e: `e2e/docs-e2e/tests/`
- Generated docs build output: `packages/docs/dist/`

## LLM Output Rules

The docs build can generate:

- `dist/llms.txt`
- `dist/llms-ctx.txt`
- `dist/llms-ctx-full.txt`
- curated markdown mirrors under `dist/docs/`

Do not hand-edit generated files in `packages/docs/dist/`. Edit docs source or
`packages/docs/scripts/generate-llms.ts`, then regenerate.

Keep the LLM manifest curated. Existing pages regenerate automatically, but new public LLM surface
area should be added intentionally with `section`, `title`, `pathname`, `sourcePath`, and
`description`.

## Verification

Use the narrowest relevant command:

```bash
pnpm -C packages/docs generate.llms
pnpm -C packages/docs build
pnpm playwright test e2e/docs-e2e/tests/docs-smoke.spec.ts --config e2e/docs-e2e/playwright.config.ts --project chromium
```

Set `QWIK_LLMS_BASE_URL` only when intentionally testing alternate generated links.

## Stop Conditions

- Stop before adding a new page to LLM outputs unless it should be part of the curated public LLM
  surface.
- Stop and run or request the relevant docs build when route generation or static output behavior is
  changed.
- If docs source or scripts contradict this skill, update the skill before finishing or record why
  guidance edits were out of scope.

## No Hydration Terminology

Never describe Qwik or any part of how Qwik works as hydration. Qwik does not hydrate. Qwik is
resumable: the server serializes application state and listeners into the HTML, and the client
resumes execution exactly where the server left off, without re-running component code or
rebuilding the framework state.

- Do not call any Qwik mechanism "hydration", "hydrating", "rehydration", "partial hydration",
  "progressive hydration", "selective hydration", or "island hydration".
- Do not describe Qwik components, containers, or apps as "hydrated" or "needing to hydrate".
- Use the Qwik terminilogy instead: "javascript streaming", "JIT preloading", "resumability", "resume", "resuming", "serialization", "deserialization", and "lazy execution".
- Describe client startup as Qwik resuming from serialized state, not as Qwik booting, mounting,
  or hydrating the app.

### Allowed Mentions

The word "hydration" may appear only when explicitly contrasting Qwik with hydration-based
frameworks, and the sentence must make clear that hydration is what other frameworks do and what
Qwik avoids. For example: "Unlike frameworks that hydrate on the client, Qwik resumes from
serialized state." Never use hydration vocabulary, even casually or by analogy, to explain what
Qwik itself does.
