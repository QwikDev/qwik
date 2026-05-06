# Out-of-order Suspense streaming

This document describes the current out-of-order Suspense streaming model. The short version is:

1. The fallback and shell stream first.
2. Resolved Suspense content HTML may stream and swap before the root stream is finished.
3. Segment state, vnode data, sync functions, and patches always stream after the root state is ready.
4. Content can be visible before it is interactive. It becomes interactive after root state and its segment scripts are processed.

The important split is:

```text
segment render result = {
  html:    HTML that can be inserted into the DOM early,
  scripts: state/vnode/qfunc/patch metadata that must wait for root state,
}
```

## Terms

```text
root state
  The main container snapshot. This includes the root object graph, root vnode data,
  qfunc table, event data, and other root-level resumability metadata.

Suspense boundary
  A server-rendered Suspense instance with a numeric boundary id. In the HTML this
  is represented with q:f and q:r attributes plus q:sus comments.

segment
  A separately rendered subtree for a Suspense content branch. Segment ids look
  like s1, s2, and so on. Segment state scripts carry q:s="s1".

resolved HTML
  The actual content DOM for a resolved segment. It is streamed in a template:

    <template q:r="1"> ... resolved content ... </template>

qO()
  The tiny out-of-order executor entry point. qO(1) finds template q:r="1",
  appends its content into the Suspense content host, hides the fallback host,
  shows the content host, and then asks Qwik to process any newly available data.

segment scripts
  The delayed scripts emitted for a segment: q:s state, q:s vnode data, appended
  qfuncs when needed, backpatch data, and the qO.p() processing trigger.
```

## Contract

The ordering rule is:

```text
resolved HTML + qO() may appear before root state
segment scripts must appear after root state
```

Visually:

```text
time ->

shell/fallback HTML     resolved HTML + qO()       root state       segment scripts
--------------------    --------------------       ----------       ---------------
visible fallback        visible content            root resumes     content resumes
interactive: no         interactive: no            fallback yes     content yes
```

The browser is allowed to show the resolved content as soon as the resolved HTML arrives. It is not allowed to deserialize that segment's state until the root state exists.

## Why state waits for root

Segment state is not independent. It can reference root-owned objects, and root-owned objects can need subscriptions that point into the segment.

Example:

```tsx
const shared = useSignal(0);

<p id="shell">shared={shared.value}</p>

<Suspense fallback={<Fallback shared={shared} />}>
  <Content shared={shared} />
</Suspense>
```

The resolved content reads `shared.value`. The DOM for that content can be streamed early:

```html
<template q:r="1">
  <div q:host="">
    <p id="content">shared=0</p>
    <button>increment</button>
  </div>
</template>
<script>
  qO(1);
</script>
```

But the segment state may contain references like:

```text
segment s1:
  content vnode effect -> depends on root signal #3
  root reference -> #3 from the root state
```

That cannot be processed before the root state has created object `#3`. The correct browser order is:

```text
1. parse root state
2. create root signal #3
3. parse segment s1 state
4. resolve segment references to root signal #3
5. merge segment effects into root signal #3
```

If segment state ran first, the deserializer would have to guess what root object `#3` is. That breaks resumability.

## Server timeline

### 1. Initial Suspense render captures promises

Suspense renders its content once in `suspense-capture` mode.

```text
root render
  Suspense content pass
    child throws/captures Promise
  Suspense renders fallback host
  Suspense renders empty content host
  enqueue resolved segment work
  flush shell
```

The shell contains a real fallback subtree:

```html
<!--q:sus=1-->
<div q:f="1" style="display:contents">
  <button id="fallback">Touch fallback</button>
</div>
<div q:r="1" style="display:none"></div>
<!--/q:sus=1-->
```

The fallback is real HTML, but it is only interactive after the root state is parsed.

### 2. Promises can resolve in parallel

Different Suspense promises can resolve at the same time:

```text
promise A resolved
promise B resolved
promise C still pending
```

They are not allowed to render their segments at the same time. `segment()` temporarily owns mutable SSR container state:

```text
writer
stream handler
serialization context
current element frame
current component node
vnode data array
backpatch map
cleanup queue
```

Because of that, resolved segment renders are queued.

```text
promise A -> queue segment(A)
promise B -> queue segment(B)

queue:
  segment(A)
  segment(B)
```

### 3. Ready segments drain before root state starts

Before the root container emits root state, the SSR container calls:

```text
flushOutOfOrderRendersBeforeRootState()
```

That creates a narrow but useful window:

```text
root shell HTML is done
root state has not started
ready Suspense content can render and stream
```

This avoids concurrent mutation of the root render while still allowing resolved content to be swapped before the stream ends.

```text
time ->

root walks app and shell     drain ready segments       emit root state
-----------------------     --------------------       ---------------
mutable root render          queued segment render      no early segments now
no segment render yet        HTML can stream/swap       scripts can resume
```

### 4. `segment()` splits HTML from scripts

The segment render uses a `StringBufferWriter`. After the content DOM is rendered:

```text
html = writer.toString()
writer.clear()
emit segment scripts into same writer
scripts = writer.toString()
```

Conceptually:

```text
segment s1 render
  render JSX content into writer
  html = "<section id='resolved'>...</section>"

  clear writer

  emit q:s state
  emit q:s vnode data
  emit qfunc append if root already ready
  emit patch data
  scripts = "<script type='qwik/state' q:s='s1'>...</script>..."
```

The same writer is reused because the serializer owns the writer it was constructed with. Swapping the writer object after creating the serialization context would make the state script open in one writer and the serialized JSON write into another.

### 5. Resolved HTML streams and swaps early

For a resolved segment, Suspense writes only the `html` part first:

```html
<template q:r="1">
  <section id="resolved">
    <button>Touch resolved</button>
  </section>
</template>
<script>
  qO(1);
</script>
```

Then it flushes.

At this point the browser can run `qO(1)`:

```text
before qO:

<!--q:sus=1-->
<div q:f="1" style="display:contents">fallback</div>
<div q:r="1" style="display:none"></div>
<!--/q:sus=1-->
<template q:r="1">resolved</template>

after qO:

<!--q:sus=1-->
<div q:f="1" style="display:none">fallback</div>
<div q:r="1" style="display:contents">resolved</div>
<!--/q:sus=1-->
```

The content is visible. It is still inert until the delayed segment scripts are processed.

## Browser timeline

### Before root state

The out-of-order executor can swap HTML:

```text
qO(1)
  find template q:r="1"
  find fallback host q:f="1"
  append template.content into content host
  fallback.style.display = "none"
  content.style.display = "contents"
  call document.qProcessOOOS if present
```

If the root container is not resumed yet, `document.qProcessOOOS` is not installed. The swap still works because it is plain DOM movement.

```text
visible content: yes
Qwik interactivity: no
segment state parsed: no
```

### Root resume

When Qwik creates `DomContainer`, it processes data in this order:

```text
DomContainer constructor
  processVNodeData(document)
  install document.qProcessOOOS
  load qfunc table
  process root state script
  process segment state scripts already present
  hoist styles
  dispatch qresume
```

The root state is always first.

### After root state

Buffered segment scripts are drained immediately after root container data is emitted:

```html
<script type="qwik/state" q:instance="..." q:s="s1">
  ...
</script>
<script type="qwik/vnode" q:s="s1">
  ...
</script>
<script>
  qO.p();
</script>
```

Now the browser can process:

```text
qProcessOOOS(document)
  process vnode data for any new q:s scripts
  process segment state scripts
  merge q:fx external root effects
```

The resolved content becomes resumable and interactive.

## Chunk example

This is a simplified stream where the Suspense promise resolves before the root state is emitted:

```html
<!-- chunk 1: shell -->
<div q:container="paused">
  <main>
    <h1>Title</h1>
    <!--q:sus=1-->
    <div q:f="1" style="display:contents">
      <button>Waiting</button>
    </div>
    <div q:r="1" style="display:none"></div>
    <!--/q:sus=1-->
    <footer>Footer</footer>
  </main>
</div>
```

```html
<!-- chunk 2: resolved HTML before root state -->
<template q:r="1">
  <button>Done</button>
</template>
<script>
  qO(1);
</script>
```

```html
<!-- chunk 3: root state -->
<script type="qwik/state" q:instance="abc">
  ...
</script>
<script type="qwik/vnode">
  ...
</script>
<script q:func="qwik/json">
  ...
</script>
```

```html
<!-- chunk 4: segment scripts after root state -->
<script type="qwik/state" q:instance="abc" q:s="s1">...</script>
<script type="qwik/vnode" q:s="s1">...</script>
<script>qO.p()</script>
</div>
```

The important ordering is:

```text
index("<template q:r=\"1\">") < index("type=\"qwik/state\"")
index("qO(1)")               < index("type=\"qwik/state\"")
index("q:s=\"s1\"")          > index("type=\"qwik/state\"")
```

## Multiple Suspense boundaries

Promises can resolve in any order:

```text
boundary 1 promise: slow
boundary 2 promise: fast

time ->
shell -> boundary 2 resolves -> boundary 1 resolves -> root state -> segment scripts
```

The render queue serializes segment renders:

```text
ready queue before root state:
  render segment s2
  render segment s1

stream before root state:
  <template q:r="2">...</template><script>qO(2)</script>
  <template q:r="1">...</template><script>qO(1)</script>

after root state:
  scripts for s2
  scripts for s1
```

The queue is not about network ordering. It is about protecting the single mutable SSR container while still allowing every resolved segment to stream as soon as the shell is stable.

## Reveal coordination

Reveal adds group metadata to the resolved templates:

```html
<template q:r="1" q:g="1" q:i="0" q:o="s">...</template>
<template q:r="2" q:g="1" q:i="1" q:o="s">...</template>
<script>
  qO(2);
</script>
<script>
  qO(1);
</script>
<script>
  qO.g(1, 2, 's');
</script>
```

For sequential reveal, `qO()` may receive boundary 2 before boundary 1. The executor stores it, but does not swap it until the group order allows it.

```text
qO(2)
  store resolved template 2
  cannot flush yet because index 0 is missing

qO(1)
  store resolved template 1
  flush index 0
  flush index 1
```

This Reveal ordering affects when HTML swaps. It does not change the state rule: segment scripts still wait for root state.

## Cross-state fallback and content

When root state is used inside fallback or content, the server has to avoid serializing invalid references.

```tsx
const shared = useSignal(0);

<Suspense fallback={<Fallback shared={shared} />}>
  <Content shared={shared} />
</Suspense>;
```

### What happens while rendering the segment

The segment reads `shared.value`, so the root signal receives a segment-owned effect:

```text
root signal shared
  effects:
    shell text effect
    fallback text effect
    segment content text effect
```

If the root state were serialized with `segment content text effect`, it could point at a segment vnode that the browser has not processed yet.

So pre-root segment render does two things:

1. It records those external root effects in the segment state as a `q:fx` patch.
2. It detaches them from the root signal before root state is serialized.

Conceptually:

```text
before root state serialization:

root signal shared
  effects:
    shell text effect
    fallback text effect

segment s1 state
  q:fx:
    root signal shared -> segment content text effect
```

After the browser processes the segment state:

```text
root signal shared
  effects:
    shell text effect
    fallback text effect
    segment content text effect
```

That is why clicking a resolved content button can update root-owned state after segment scripts arrive.

## Sync functions and qfunc offsets

Inline sync functions need stable indexes. Segment serialization uses the parent root qfunc table length as its offset.

Before root state is ready:

```text
segment discovers new sync fn
segment merges sync fn into root serialization context
segment does not emit an append qfunc script
root qfunc script includes it
```

After root state is ready:

```text
segment discovers new sync fn
segment emits append qfunc script
browser pushes it into the existing qfunc table
```

This keeps ids stable in both early and late segment cases.

## Why not stream segment state early too?

Because it would force one of these bad choices:

```text
Option A: deserialize segment before root
  fails when segment references root objects

Option B: duplicate root-owned objects in the segment
  breaks identity and cross-state updates

Option C: make root state splittable
  possible later, but it is a larger protocol change

Current option: stream segment HTML early, buffer segment metadata until root state
  preserves identity and still improves visual streaming
```

The current model optimizes the user-visible path without changing the root snapshot protocol.

## Invariants

Keep these true when changing this code:

1. Root state is processed before any segment state.
2. Resolved HTML may stream before root state, but segment scripts may not.
3. `segment()` must not run concurrently with another render using the same SSR container.
4. Ready segment renders can drain after shell HTML is complete and before root state begins.
5. Once root state begins, new segment renders must wait until root state is ready.
6. Cross-root segment effects must not be serialized directly into the pre-root root state.
7. Segment qfunc ids must be stable relative to the root qfunc table.
8. `qO()` must be able to swap HTML even when Qwik has not resumed yet.

## Code map

```text
packages/qwik/src/core/control-flow/suspense.tsx
  SSRSuspense
    renders fallback/content hosts
    queues resolved segment work

  emitResolvedOutOfOrderSegment()
    waits for the captured promise
    renders segment HTML before root state if possible
    writes <template q:r> + qO()
    buffers segment scripts until root state when needed

  SSRContainer.emitOutOfOrderSegmentScripts()
    buffers scripts before root state
    writes scripts immediately after root state is ready
    triggers qProcessOOOS()

packages/qwik/src/server/ssr-container.ts
  segment()
    splits html from scripts
    records q:fx patches
    handles sync fn merging/appending

  $runQueuedRenderBeforeRootState$()
    queues early resolved segment renders

  flushOutOfOrderRendersBeforeRootState()
    drains those renders between shell HTML and root state

  $runQueuedRender$()
    serializes mutable SSR container ownership
    waits for root state once root state emission has started

packages/qwik/src/core/client/dom-container.ts
  DomContainer constructor
    processes root state first
    then processes segment states

  qProcessOOOS()
    processes newly streamed vnode data and segment state

  $mergeExternalRootEffects$()
    applies q:fx patches into root-owned signals

packages/qwik/src/out-of-order-executor-shared.ts
  qO()
    swaps resolved template HTML into the content host
```
