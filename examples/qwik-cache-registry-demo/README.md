# Qwik Cache Registry Demo

This is a runnable, dependency-free demo for the Qwik v2 cache-registry RFC.

It models the same split the framework prototype is moving toward:

```txt
server$ resource registry
-> request fan-out and dedupe
-> component render registry
-> optional rendered component HTML cache
-> normal render fallback when unsafe
```

The demo is intentionally simplified. It does not claim that Qwik core can safely reuse cached component HTML yet. Real Qwik component HTML caching must preserve Qwik SSR metadata, serialized state, QRL references, and resumability markers.

## Run

```sh
node examples/qwik-cache-registry-demo/demo.mjs --cache=off --delay=80 --repeat=2
node examples/qwik-cache-registry-demo/demo.mjs --cache=request --delay=80 --repeat=2
node examples/qwik-cache-registry-demo/demo.mjs --cache=memory --delay=80 --repeat=2
```

## Cache Levels

`off`

Runs every registered server resource and component render normally.

`request`

Enables request-local server resource in-flight dedupe and resolved-value reuse.

`memory`

Enables request-local server resource reuse, process memory server resource reuse, and rendered component HTML reuse for safe components.

## Knobs

```txt
--cache=off|request|memory
--delay=80
--repeat=2
--ids=1,2,1,3
--unsafe=false
```

Use `--unsafe=true` to mark `ProductCard` ineligible for rendered HTML reuse. The server resources can still cache, but the component render falls back to normal rendering.

## What To Look For

With duplicate IDs such as `1,2,1,3`, request caching should reduce server resource calls inside each request.

With `--cache=memory --repeat=2`, the second request should mostly hit the component HTML cache and avoid both server resource calls and component render work.
