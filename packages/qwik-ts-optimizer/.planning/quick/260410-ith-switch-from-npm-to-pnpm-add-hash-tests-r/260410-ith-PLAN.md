---
type: quick
tasks: 2
estimated_context: 25%
---

<objective>
Switch package manager from npm to pnpm, and replace raw regex literals with magic-regexp for improved readability.

Purpose: pnpm is faster and uses less disk space; magic-regexp makes regex patterns self-documenting and less error-prone.
Output: pnpm-lock.yaml replaces package-lock.json, all regex literals converted to magic-regexp, all tests pass.
</objective>

<context>
@CLAUDE.md
@package.json
@src/hashing/siphash.ts
@src/testing/snapshot-parser.ts
@tests/hashing/siphash.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Switch from npm to pnpm</name>
  <files>package.json, package-lock.json, pnpm-lock.yaml</files>
  <action>
1. Delete `package-lock.json` and `node_modules/`
2. Run `pnpm install` to generate `pnpm-lock.yaml` and reinstall all dependencies
3. Verify the lockfile was created and all dependencies resolve
4. Run `pnpm test` to confirm nothing broke
5. Add a `packageManager` field to package.json: `"packageManager": "pnpm@latest"` (use the actual installed pnpm version from `pnpm --version`)
6. Optionally add `engines.pnpm` if appropriate

Do NOT change any dependency versions. This is purely a package manager swap.
  </action>
  <verify>
    <automated>cd /Users/jackshelton/dev/open-source/qwik-optimizer-ts && pnpm test</automated>
  </verify>
  <done>package-lock.json deleted, pnpm-lock.yaml exists, `pnpm test` passes, node_modules reinstalled via pnpm</done>
</task>

<task type="auto">
  <name>Task 2: Replace raw regex with magic-regexp</name>
  <files>package.json, src/hashing/siphash.ts, src/testing/snapshot-parser.ts, tests/hashing/siphash.test.ts</files>
  <action>
1. Run `pnpm add magic-regexp` to add as a production dependency (it is used in src/ files)

2. In `src/hashing/siphash.ts`, replace lines 44-48 regex chain:
   - `/\+/g` (replace plus) -> use `exactly('+').globally()` or similar magic-regexp pattern
   - `/\//g` (replace slash) -> use `exactly('/').globally()`
   - `/=+$/` (strip trailing equals) -> use `oneOrMore('=').at.lineEnd()`
   - `/[-_]/g` (replace dash/underscore) -> use `charIn('-_').globally()`
   Import from `magic-regexp` at top of file.

3. In `src/testing/snapshot-parser.ts`, replace all regex patterns:
   - Line 166: `/^={3,}\s*.+?\s*==$/m` section delimiter test
   - Line 183: `/^(={3,})\s*(.+?)\s*(==)$/` section delimiter with captures (SECTION_DELIM_RE)
   - Line 266: `/^Some\("(.*)"\)$/m` Some wrapper match
   - Line 274: `/\\"/g` unescape quotes
   - Line 275: `/\\\\/g` unescape backslashes
   - Line 293: `/^\n+/` and `/\n+$/` trim newlines
   Import from `magic-regexp` at top of file. For complex patterns with captures, use `createRegExp()` with named groups where it improves clarity. If a particular regex is simpler as a raw literal (e.g., simple single-char replacements), prefer keeping it raw -- use magic-regexp where it genuinely improves readability.

4. In `tests/hashing/siphash.test.ts`, replace:
   - Line 25: `/^[A-Za-z0-9]+$/` -> use `oneOrMore(charIn('A-Za-z0-9')).at.lineStart().at.lineEnd()`
   - Line 27: `/[-_]/` -> use `charIn('-_')`

5. Run `pnpm test` to confirm all tests still pass with the new regex patterns. The behavior must be byte-identical -- magic-regexp is syntactic sugar, not a behavior change.
  </action>
  <verify>
    <automated>cd /Users/jackshelton/dev/open-source/qwik-optimizer-ts && pnpm test</automated>
  </verify>
  <done>magic-regexp added to dependencies, all raw regex in src/ and test files replaced where it improves readability, all tests pass with identical behavior</done>
</task>

</tasks>

<verification>
- `pnpm test` passes (all existing tests green)
- No `package-lock.json` exists
- `pnpm-lock.yaml` exists
- `magic-regexp` appears in package.json dependencies
- No raw regex literals remain in src/hashing/siphash.ts (all converted)
- snapshot-parser.ts and siphash.test.ts use magic-regexp where appropriate
</verification>

<success_criteria>
Package manager fully switched to pnpm with lockfile. Regex patterns replaced with magic-regexp for improved readability. All 209-snapshot corpus hash tests and all other tests pass unchanged.
</success_criteria>
