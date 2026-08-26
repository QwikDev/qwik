---
'@qwik.dev/router': patch
---

fix: serve `.wasm` static files with the `application/wasm` content type. Browsers require it for `WebAssembly.instantiateStreaming`; without it the streaming compile is rejected and runtimes fall back to downloading the binary a second time.
