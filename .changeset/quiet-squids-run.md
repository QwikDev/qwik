---
'@builder.io/qwik-city': minor
---

fix: server$ functions now correctly throw 4xx errors on the client
fix: server$ errors can be caught by @plugin middleware
refactor: Error types are standardised across server$ functions and routeLoaders
feat: 499 is now a valid status code
