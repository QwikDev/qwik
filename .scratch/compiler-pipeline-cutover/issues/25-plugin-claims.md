# How an import becomes a PluginCall claim
Type: grilling
Status: resolved
Blocked by:

## Question

Ticket 07 routes calls to claimed imports through `PluginCall` and names router `$`-family markers
(`routeLoader$`, `routeAction$`, `server$`, `globalAction$`, 148 real-app hits) as claims by
construction. Decide the claim mechanism over `LinkedPlan`: where claims are declared (the
`PluginSnapshot.claims` the linker already accepts, populated by whom: the framework package, a vite
option, a manifest), the claim key (`plugin:<module>:<export>`), what a claim carries for the JS side
(nothing: authored text stays) and for a native reader (an `implementations` entry: files, external
package, or registration), the diagnostic when a server-reachable call hits an unclaimed import under
`jsHoles: 'forbid'`, and how core+router compile with zero user plugins (spec 09's requirement).

## Answer

Resolved 2026-09-17 (Varixo: Q1–Q5 accepted, Q6 overridden: `native$` is the plugin system, nothing more).

- **Declaration surface**: `native$(jsImpl, { <target>: <implementation> })` in source is the only way to attach
  a native implementation. No `package.json` claim field, no vite `plugins` option. An imported third-party
  symbol is claimed by wrapping it in the author's own module (`const formatPrice = native$(pkgFormatPrice,
  { rust: … })`); a package author ships claims by using `native$` in the package's own source; the router
  does the same for its exports, with `registration` implementations for what the engine provides, so core
  plus router compile with zero user plugins.
- **Plan representation**: a call to a `native$` declaration is a `PluginCall { fnId, args }` with
  `fnId = plugin:<package>:<export>`, arg count and async-ness recorded on the node by the linker; the
  `natives` table records each declaration; the artifact's `implementations` table carries the per-language
  content (`files`, `external-package`, `registration`); a reader fails closed naming the missing
  implementation. JS output is untouched (authored text).
- **Internal ops are not claims**: `qwik:` ops come from receiver-type analysis of stdlib calls, never imports.
- **Diagnostic**: under `jsHoles: 'forbid'`, a server-reachable call to an import with no `native$` declaration
  and no lowerable body is `unclaimed-import` (module and export named), distinct from `js-hole`.
- **Policies** (`stripCtxName`, `regCtxName`, `stripEventHandlers`): ticket 26.
- **`PluginSnapshot.claims`** as a linker input is dropped; claims are facts of the module plans.
