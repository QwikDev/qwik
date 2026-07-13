---
'@qwik.dev/devtools': patch
---

refactor(devtools): extract findComponentKey and component-name derivation as runtime utilities

The component-key lookup and the "name after the last underscore" derivation were inlined inside
the hook runtime installer and duplicated across getComponentDetail, setSignalValue, and
getComponentTreeSnapshot. They are now top-level `__qwik_find_component_key__` and
`__qwik_derive_component_name__` functions, emitted by name into the injected runtime bundle and
reused by every caller. Being pure, they are also covered by unit tests.
