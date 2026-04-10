---
type: quick
tasks: 1
estimated_context: 15%
---

<objective>
Convert all remaining raw regex literals in snapshot-parser.ts and siphash.test.ts to magic-regexp.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Convert all raw regex to magic-regexp</name>
  <files>src/testing/snapshot-parser.ts, tests/hashing/siphash.test.ts</files>
  <action>
1. Add magic-regexp import to snapshot-parser.ts
2. Convert 7 regex patterns in snapshot-parser.ts:
   - Line 166: `/^={3,}\s*.+?\s*==$/m` → anchored chain with multiline flag
   - Line 183: SECTION_DELIM_RE with named groups
   - Line 266: Some("...") pattern with named group
   - Line 274: `\/\\"/g` → exactly('\"')
   - Line 275: `/\\\\/g` → exactly('\\\\')
   - Line 293: leading/trailing newline patterns → linefeed helpers
3. Add magic-regexp import to siphash.test.ts
4. Convert 2 regex patterns in siphash.test.ts:
   - Line 25: `/^[A-Za-z0-9]+$/` → anyOf(letter, digit) 
   - Line 27: `/[-_]/` → charIn('-_')
5. Run pnpm test to verify
  </action>
  <verify>
    <automated>pnpm test</automated>
  </verify>
  <done>All raw regex converted, all tests pass</done>
</task>

</tasks>
