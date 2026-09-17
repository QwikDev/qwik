# Element-less `useOn*` / `useVisibleTask$` roots: keep runtime relocation or emit static carriers
Type: grilling
Status: resolved
Blocked by:

## Question

Research 15: the runtime's `<script hidden>` carrier build and `relocateHeadlessCarriers` are the only
path for a component with no root element that registers document/window events or a visible task;
the README calls static carrier emission a "future slice" and the flat-output ledger said records die at
cutover. Decide: keep the runtime relocation as the permanent mechanism (and correct the README), or
have the SSR generator emit the carrier statically at the component's position so no runtime relocation
exists. Consider the native engine: a relocation step is runtime behavior an engine must reimplement;
a static carrier is plain output.

## Answer

Resolved 2026-09-17 (Varixo accepted all).

- **Mechanism**: the SSR generator emits, at the component's own position, an inline `<script hidden>` open-tag
  record when the root's first op is not an element and `registersEvents` is true or unknown; the runtime
  fills it through the same `appendEvent` splice element roots use. No relocation pass:
  `relocateHeadlessCarriers`, `insertAfterElement`, `removeHeadlessCarriers` and the `headlessCarrier` flag
  are deleted. The record-path rule applies to every runtime splice.
- **Parser safety**: `<script>` is valid in table and select insertion modes; a headless registering
  component under an RCDATA or raw-text parent (`title`, `textarea`, `script`, `style`) is diagnosed
  (`headless-carrier-context`) by the DOM-nesting table.
- **Streaming and lanes**: the carrier is part of its lane's output and commits with it in document order.
- **Docs**: the README flat-output ledger is rewritten to this rule; CONTEXT.md's "carrier" already matches.
