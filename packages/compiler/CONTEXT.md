# Qwik compiler

The staged compiler that turns authored Qwik modules into per-module plans, links them into one
plan per environment, and generates JavaScript for the browser and the server. The linked plan is
the contract any rendering engine reads.

## Language

### Plans

**Module plan**:
The per-file, environment-neutral result of analysis.
_Avoid_: "the plan" when a linked plan is meant

**Linked plan**:
One environment's materialized whole-app plan; the artifact a rendering engine reads.
_Avoid_: SSR plan, wire plan, QwikSsrPlan

**Library plan**:
A published package's neutral module plans with their entries and resolver edges.

**Complete link**:
A link in which every reachable module is present. Only a complete link yields an artifact.
_Avoid_: full link

**Incomplete link**:
A per-module link in which unreached references are typed unknowns.

**Artifact**:
A serialized linked plan written by a build.
_Avoid_: output (output is generated JavaScript)

### Execution units

**Program**:
A render body lowered to ops: a component render, a branch arm, a row, a projection.
_Avoid_: render function, segment

**Payload**:
An authored source range plus its table of holes; the JavaScript shell of a body.
_Avoid_: source text, js body

**Hole**:
A position inside a payload the compiler owns: a read, a QRL use, an await, a render, a setup.
Always the payload sense; the JSX sense is a text hole.
_Avoid_: splice, placeholder

**QRL**:
A lazy-loadable boundary the compiler extracted. Its body is a program, an expression, or a payload.
_Avoid_: chunk (for the boundary)

**Chunk**:
The emitted module file carrying one or more QRL bodies.
_Avoid_: segment (for the file)

**Segment**:
The stable wire identity of a QRL: symbol, hash, parent.
_Avoid_: segment for any other unit

**Boundary**:
The `$` site that creates a QRL: explicit, implicit hook, event, sync, component.
_Avoid_: marker (for the site)

**Marker**:
A `$`-suffixed callee the compiler recognizes, core or custom.

**Twin**:
The QRL-taking runtime pair of a custom marker.

### Values

**IR**:
The portable expression vocabulary a rendering engine evaluates.
_Avoid_: expression tree, AST

**Live alias**:
A `const` whose initializer is a prop read, a store, or a signal member; every read goes to the source.
_Avoid_: reactive alias

**Snapshot**:
An ordinary JavaScript value captured at QRL creation.
_Avoid_: copy, frozen value

**Capture**:
A per-render local a QRL carries.
_Avoid_: closure variable

**Seed**:
An ordinal allocated in authored order that folding never renumbers.

### Render structure

**Content**:
A dynamic child position whose result shape is not proven, rendered through a content range.
_Avoid_: dynamic content

**Text hole**:
A proven-scalar child position rendered as a text effect.
_Avoid_: hole (alone)

**Branch**:
A conditional with arms.

**Collection**:
A mapped source rendered as rows.
_Avoid_: loop, each, list

**Row**:
One element of a collection.
_Avoid_: list item

**Projection**:
Content an author passes into a component.
_Avoid_: children (children is only the prop name)

**Slot**:
The position inside a component that receives a projection.

**Carrier**:
The element or `<script>` holding a headless component's event registrations on the server.

**Lane**:
A suspendable render unit on the server with its own scheduler lane and id prefix; output commits in
document order.
_Avoid_: head, transaction

### Analysis facts

**Binding graph**:
The lexical facts of one module.

**Candidate**:
A function that may be a component or a hook before discovery confirms it.

**Lifetime**:
The owner a reactive subscription belongs to.

### Retired

**target-native**:
Meant no-VNode emission in an earlier effort; collides with native engines.
_Avoid_: everywhere

**hydration**:
Qwik resumes; it never hydrates.
_Avoid_: every variant

**legacy, oracle, differential**:
Meaningful only while the old compiler existed.
_Avoid_: after cutover
