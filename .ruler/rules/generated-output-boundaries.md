# Generated Output Boundaries Rule

Edit source files, not generated artifacts. Generated files are evidence to regenerate or inspect,
not the place to make durable changes.

## Do Not Hand-Edit

Do not hand-edit generated outputs such as:

- root assistant outputs: `AGENTS.md`, `CLAUDE.md`, `.codex/`, `.claude/`, `.cursor/`
- package build output: `dist/`, `lib/`, `target/`
- public API markdown: `*.api.md`
- API metadata: `tsdoc-metadata.json`
- generated docs output under `packages/docs/dist/`

Edit the owning source or generator instead.

## Regenerate Intentionally

Run the narrowest generator or updater that owns the changed output:

- Public API changes: run `pnpm api.update`.
- Docs LLM output changes: run the docs generator or build from `packages/docs`.
- Optimizer build output changes: run the relevant optimizer build, such as `pnpm build.full`, when
  Rust/WASM output is expected to change.
- Optimizer fixture snapshots: update snapshots only when the transform behavior change is
  intentional and reviewed.
- Ruler assistant output: run a Ruler dry-run or local apply from `.ruler` source changes.

Use the relevant package skill for exact commands and suite-specific details.

## Review Standard

Before finishing a change that touches or depends on generated output:

1. Identify the source file or generator that owns the output.
2. Confirm whether the generated file should be regenerated, ignored, or left unchanged.
3. Run the narrowest relevant generator/check when the environment supports it.
4. Record any missing dependency, network, toolchain, or generated-artifact blocker.
5. Do not claim generated output verification from a source-only check unless that check covers the
   generated artifact.
