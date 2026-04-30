---
'@qwik.dev/core': patch
'@qwik.dev/router': patch
---

fix(core): Q3 error "Only primitive and object literals can be serialized" no longer throws for route loaders and actions. 

fix(router): `QwikRouterMockProvider`'s `loaders` mocks stopped working due to a V2 refactor. They now properly mimick V2's implementation and work as expected.
