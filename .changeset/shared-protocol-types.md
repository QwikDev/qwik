---
'@qwik.dev/devtools': patch
---

refactor(devtools): single source of truth for shared protocol types

The VNode tree node, component detail entry, and render event shapes were declared
three times: in the browser extension, in the devtools UI, and in the kit client
bridge. They now live once in @qwik.dev/devtools/kit (protocol module) as
DevtoolsVNodeTreeNode, DevtoolsComponentDetailEntry, and DevtoolsRenderEvent, and
every consumer imports them from there.
