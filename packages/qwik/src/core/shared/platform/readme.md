# `CorePlatform`

Low-level API for platform abstraction.

Different platforms (browser, node, service workers) may have different ways of handling things such as `requestAnimationFrame` and imports. To make Qwik platform-independent Qwik uses the `CorePlatform` API to access the platform API.

`CorePlatform` also is responsible for importing symbols. The import map is different on the client (browser) then on the server. For this reason, the server has a manifest that is used to map symbols to javascript chunks. The manifest is encapsulated in `CorePlatform`, for this reason, the `CorePlatform` can't be global as there may be multiple applications running at server concurrently.

This is a low-level API and there should not be a need for you to access this.

@public

# `CorePlatform.isServer`

True of running on the server platform.

@returns True if we are running on the server (not the browser.)

# `CorePlatform.importSymbol`

Retrieve a symbol value from QRL.

Qwik needs to lazy load data and closures. For this Qwik uses QRLs that are serializable references of resources that are needed. The QRLs contain all the information necessary to retrieve the reference using `importSymbol`.

Why not use `import()`? Because `import()` is relative to the current file, and the current file is always the Qwik framework. So QRLs have additional information that allows them to serialize imports relative to application base rather than the Qwik framework file.

@param element - The element against which the `url` is resolved. Used to locate the container root and `q:base` attribute.
@param url - Relative URL retrieved from the attribute that needs to be resolved against the container `q:base` attribute.
@param symbol - The name of the symbol to import.
@returns A promise that resolves to the imported symbol.

# `CorePlatform.raf`

Perform operation on next request-animation-frame.

@param fn - The function to call when the next animation frame is ready.

# `CorePlatform.chunkForSymbol`

Retrieve chunk name for the symbol.

When the application is running on the server the symbols may be imported from different files (as server build is typically a single javascript chunk.) For this reason, it is necessary to convert the chunks from server format to client (browser) format. This is done by looking up symbols (which are globally unique) in the manifest. (Manifest is the mapping of symbols to the client chunk names.)

@param symbolName - Resolve `symbolName` against the manifest and return the chunk that contains the symbol.

# `getPlatform`

Retrieve the `CorePlatform`.

The `CorePlatform` is also responsible for retrieving the Manifest, that contains mappings from symbols to javascript import chunks. For this reason, `CorePlatform` can't be global, but is specific to the application currently running. On server it is possible that many different applications are running in a single server instance, and for this reason the `CorePlatform` is associated with the application document.

@param docOrNode - The document (or node) of the application for which the platform is needed.
@public

# `setPlatform`

Sets the `CorePlatform`.

This is useful to override the platform in tests to change the behavior of, `requestAnimationFrame`, and import resolution.

@param doc - The document of the application for which the platform is needed.
@param platform - The platform to use.
@public
