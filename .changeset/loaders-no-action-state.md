---
'@qwik.dev/router': major
---

BREAKING: `routeLoader$` cannot read action state any more, so that they are cacheable and predictable. All use cases can be achieved in other ways, like reading the action signal directly in the component or having the loader read from URL-derived state that the action updates.
