'@qwik.dev/router': major

BREAKING: Route loaders are now AsyncSignals. This means that `value.failed` is no longer used to indicate a loader failure. Instead, if a loader fails, the error will be stored in `error`, and reading `value` will throw that error.

This also means that you can now pass `expires`, `poll`, and `allowStale` options to route loaders. See the documentation for more details on these options and how to use them.
