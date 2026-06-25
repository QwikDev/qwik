---
'@qwik.dev/devtools': patch
---

This PR enhances the devtools package management experience by adding dependency inspection, search, install, update, and feedback flows to the Packages panel. It introduces new npm-related plugin logic for dependency discovery, package metadata lookup, package manager command execution, and dependency synchronization, while also updating the shared devtools types and UI state to support richer dependency information. The UI now supports searching installed dependencies, discovering packages from the registry, installing or updating dependencies, and showing success/error feedback with retry support. Additional supporting tests, package configuration updates, and doc/build-related adjustments are included.
