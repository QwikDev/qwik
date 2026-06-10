# Code Quality Rule

Write code that junior developers and AI agents can understand during review and future changes.

## Naming

- Use names that explain the domain idea, not the implementation trick.
- Prefer specific names over short names when the value crosses more than a few lines.
- Name booleans as questions or states, such as `isReady`, `hasSubscribers`, or `shouldFlush`.
- Name functions by the action they perform, such as `resolveLoaderData()` or
  `markContainerReady()`.
- Avoid vague names like `data`, `item`, `temp`, `handle`, `process`, or `doWork` unless the local
  scope makes the meaning obvious.
- Keep existing public API names unless the task is intentionally changing the API.

## Control Flow

- Prefer early returns for invalid, empty, unsupported, or already-handled cases.
- Avoid deep nesting when a guard clause can make the main path easier to read.
- Keep the success path visible at the outer indentation level when possible.
- Do not use clever boolean expressions when a named condition or small helper would be clearer.
- Keep error and compatibility branches explicit so reviewers can see why they exist.

## Modularity

- Keep functions focused on one responsibility.
- Extract a helper when a block has a clear name, is reused, or hides the main path.
- Do not extract helpers only to move complexity around; the caller should become easier to read.
- Keep helpers close to their first use unless they are shared across files.
- Prefer local semantic helpers over broad abstractions.

## Review Standard

Before finishing, read the changed code as if you are new to the package:

1. Can a junior developer explain what each name represents?
2. Can an AI agent identify the main path without following deeply nested branches?
3. Are edge cases handled by clear guard clauses or named helpers?
4. Is the change modular without hiding important state or protocol boundaries?

If the answer is no, simplify the code before calling the task complete.
