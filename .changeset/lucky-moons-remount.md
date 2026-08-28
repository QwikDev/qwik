---
'@qwik.dev/core': patch
---

fix: a component which renders no DOM element of its own and registers a document or window `useOn`
event - `useVisibleTask$` among them - no longer destroys everything it rendered on every re-render,
and no longer loses that event on some outputs.

Such a component gets a placeholder `<script>` to hang the listener on. Four problems came from how
that placeholder was added to the output:

- The output was wrapped together with the placeholder in a fragment without a key, and a new
  wrapper was built on every render. Fragments without a key are never matched against the existing
  tree, so the wrapper, every component below it and their DOM were re-created on every render,
  losing their state. After SSR the whole subtree was rebuilt on resume.
- A component returning a list of nodes lost the placeholder unless the first item happened to be a
  fragment, because the wrapped result was discarded. Its `useVisibleTask$` never ran after resume.
- A component returning a signal, a promise or anything which is not a node or a fragment lost the
  placeholder for the same reason.
- The placeholder was pushed into the node the component returned. A component returning a node it
  does not rebuild - a hoisted or shared piece of JSX - had that node modified for good, and every
  other component returning the same node then rendered a stray `<script>` carrying the first
  component's task.

Whatever such a component returns is now placed, together with the placeholder, in a single fragment
which carries a stable key, and the returned node itself is never written to. The identity of the
output no longer depends on its shape, so a component which returns a single node on one render and
a list on the next keeps its children instead of rebuilding them.

Two behaviour changes come with that:

- A component returning a list is now rendered inside that fragment, one level deeper than before,
  with the placeholder as the last child of it. `qinit` handlers run in document order, so a list
  whose first item was a fragment used to run the parent's task before the tasks of the components
  inside the list; it now runs after them, which is what a component with a single root has always
  done.
- A fragment returned without a key by such a component is given the wrapper key, so it is matched
  across re-renders like every other output. The same component without a document or window `useOn`
  event still gets a new fragment on every render, because unkeyed fragments are deliberately never
  matched by `expectVirtual`.
