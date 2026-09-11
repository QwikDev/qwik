# Linked render results

`analyse/results.ts` records expression results using the existing expression IR and binding
graph. Binding reads remain dependencies. Assignments, object escapes, function arguments,
defaults and ordered spreads describe possible values; they do not rewrite executable code.
An initializer alone cannot establish the lifetime type of a mutable value.

`link/render-results.ts` resolves those dependencies through the linker's declaration and
import tables. Reachable component uses supply props, including `propsParts`. Queries converge
monotonically, with unresolved cycles finalized as unknown. A field query retains information
about other fields even when an overlapping spread, assignment or escape makes it unknown.
One component implementation covers all its reachable callers.

Passing an object to a known consumer records a dependency on that consumer's mutations and
escapes. Read-only consumers preserve field proofs; writes to unrelated fields do not invalidate
them. Unknown consumers remain conservative.

Ordinary exports remain resolvable dependencies. An explicit export entry is externally
callable. The bundler host sets `exposeExports` on its entry modules, including library entry
modules; imported library entries are not application entries. Reexports use the same export
resolver. Escaping components and unknown callees also prevent unsafe specialization.

`link/link-content.ts` changes only the linked copy. Proven scalar holes retain text operations;
other final holes use the existing content operation and CSR/SSR content helpers. Existing
element, branch and collection operations remain specialized. Explicit string conversion
retains text semantics. Root text uses the existing SSR text-range protocol. No new runtime
effect, subscriber or serialization protocol is introduced.

## Library artifacts and build host

Library builds emit `<entry chunk>.qwik-plan.json` beside each entry. The artifact has format
`qwik/library-plan`, version 1, and contains version 3 module plans, source payloads, entry
points and resolver edges. Module IDs are portable and validated; incompatible versions and
invalid references are rejected. The artifact is a clone of the neutral plans, independent of
CSR/SSR generation and application specialization.
The neutral source also retains a stable symbol namespace, including compilation scope, so
synthetic content QRL identities survive relocation without embedding an installation path.

`packages/qwik-vite/src/plugins/linked-build.ts` collects modules through bundler hooks. Source
transforms expose virtual proxies while collection is pending. The first generated-module
load collects all configured roots and their dependencies, imports library companion plans,
links once, and only then emits component and QRL code. Library plans are relocated in memory;
their published files remain unchanged. Vite and Rolldown production/library builds use this
host without an experimental flag. Dev/HMR retains its existing implementation.

This is not completion of roadmap group 15. The full Router build still encounters unsupported
intrinsic JSX spreads, a branch capturing a dynamic component target, and derived collections
without keys. Server-only stripping is also unfinished: the host rejects recognized stripping
requirements before generation instead of emitting their implementations into client output.
Existing server-only module checks and the Qwik build-module resolver remain active. Complete
build-constant folding, custom boundaries, stripping and cold browser verification remain in
group 15. Relative external assets in published plans also need a packaging contract before
libraries depending on those assets can be supported.

## Verification and snapshot audit

`render-results.unit.ts` asserts final shapes, immutability, aliases, defaults, ordered spreads,
forwarding, imports/reexports, local components, cycles, mutation and function results. It also
checks that proven text generates no dynamic content helper. `library-plan.unit.ts` verifies
the artifact contract. The real Rolldown integration in `linked-build.unit.ts` builds one
library and two consumers, verifies different text/JSX output, public library entry behavior,
unchanged artifacts, build-module resolution and server-only rejection.
The default client-plugin test also verifies text/event QRL manifest mappings and the absence
of dynamic content for a proven text prop.

`linked-content.spec.tsx` exercises text/JSX/array/empty transitions, escaping, stable siblings
and component-root results in CSR and resume. Existing `content.unit.ts` tests cover cleanup,
late results after disposal, asynchronous ordering and context across deferred QRL resolution.
Capture validation checks registered prop sources without evaluating lazy prop getters.

Existing examples declare their known input contracts: text props, collection elements,
callback arguments, and values returned by opaque hooks. `analyse/type-results.ts` preserves
contract locations and authored source before normalization. `link/type-results.ts` uses the
TypeScript checker to query these contracts in the application module graph. Aliases,
interfaces, inheritance, generic arguments and constraints, mapped and conditional types,
intersections, and imported/reexported types use the same resolution. Queries follow only the
requested property paths, including recursive types, without expanding entire object graphs.

The checker is created lazily once per link when an unresolved binding has a declared contract.
It reads an in-memory host containing the supplied module plans and bundled TypeScript ES5
library declarations. Application files, configuration, and ambient packages are not discovered
through the filesystem. Dependencies absent from the supplied graph, `any`, and unresolved types
remain unknown. The linker still preserves all known conflicting caller values and mutations;
initializers alone never become declared contracts.

TypeScript 5.9.3, already pinned in the repository, is a compiler dependency. It remains external
to the compiler bundle and is not added to application output. The default build collects
type-only edges for analysis without marking their modules as runtime dependencies. A later
runtime use of the same module still undergoes the normal server-boundary checks. Neutral
artifacts retain their type source and binding locations; version and metadata checks reject
incompatible or malformed contracts.

All 48 previously updated CSR/SSR snapshots retain the original executable output. Only typed
fixture inputs and source locations differ; named-type support adds no snapshot changes.
Untyped, mixed and contradictory inputs remain covered separately in `render-results.unit.ts`,
including neutral library plan serialization and scoped binding contracts.
