# Preloading

When a user clicks a button, we want the code to be already there.
When they navigate to a new page, we want this to be as fast as possible.

If code is missing, the user has to wait for it to load. Then, its static imports also have to load. More waiting, this is a waterfall.

We could simply downlad all code at start, but on a slow connection or device this can mean that the code that is needed will be loaded last.

We aim to minimize the time it takes for the code to be loaded and executed. For every interaction, there are some loading strategies that result in the shortest wait for the user. We try to find the best strategy for each case.

Users will start to notice a latency in UI response from 200ms. At weak mobile speeds, that translates to about 8kB of data, but there's also the 100-500ms latency of 3G to consider.

The Qwik Docs site has 2.3MB of Brotli-compressed JS. Over a weak mobile connection this easily can take a minute to download. So we need to split the code into bundles.

We need to balance bundle size versus more bundles increasing latency via HTTP request overhead.

## Strategy

### Waterfall prevention

To prevent waterfalls, we need to tell the browser which imports will be needed when an import loads. This is the entire static import graph, all the `import` statements from all the bundles that are loaded.

We can do this because the majority of our imports are QRLs. When a QRL is run, we can use information about the import graph to give the browser the entire list of all imports that need to be loaded.

### Loading code before it is needed

If we have available bandwidth, we can download code before it is needed. We should determine which code is most likely to be needed, and download it first, as well as its static imports.

We order that code in two steps: how strong the hint is, then what kind of code it is.

In the end, all of the code that might be needed for the current page is preloaded. We only make sure that what is more likely to be needed goes first.

### Layers

Every hint has a probability, and a bundle takes the highest one that reached it. The probability is only a layer: it is not multiplied along the imports.

| Layer | Hint                                            |
| ----- | ----------------------------------------------- |
| 1     | A click, a QRL being loaded, a navigation       |
| 0.9   | Hover or focus                                  |
| 0.8   | An element in view, a QRL created on the client |
| 0.6   | The page, and the page the user just left       |
| 0.5   | A Link in view                                  |

Bundles at 0.99 and up are highest priority: they are requested at once. The others are speculative: they are requested a few at a time, with a low fetch priority, and only while nothing of the highest priority is loading and once the bundle graph has arrived.

### Kinds

Inside a layer, the kind of code decides the order:

1. Handlers. A click needs its handler before anything else.
2. Other QRLs: tasks, visible tasks, computeds, inline QRLs. They run when a handler changes state.
3. Components. On a page the server rendered they only run again on a re-render.

A bundle that holds several kinds counts as the first of them. A bundle with no QRL goes with the bundle that imports it.

For a page the user may go to (a Link, a navigation, the page they left), the order is reversed: nothing is rendered yet, so components go first.

## Available techniques in the browser

Note, currently we are only interested in preloading code, not assets. Furthermore, we only target browsers that support ES bundles.

You can preload a bundle either declaratively or imperatively.

### Declarative

By declaring a bundle, you tell the browser to expect running the bundle soon. The browser can then decide what to do with it.

The best way to preload is to use `<link rel="bundlepreload">` tags. This tells the browser to expect running the bundle soon. The browser will then download the bundle in the background, parse it and also download its static imports.

If the browser does not support this, we can use `<link rel="preload">` tags. This is not as good, because the browser will not parse the code.

At the time of writing, `bundlepreload` has 93% support and `preload` has 97% support.

Note that once you add a preload tag, you can't control when the browser will download the bundle. Therefore you should not have too many tags at the same time, and the preloader keeps a queue of bundles to preload. The bundles with high likelihood are allowed to have more tags at the same time than the ones with low likelihood.

### Imperative

We can also simply `fetch` the bundle and discard the response. The browser the hopefully keeps it in cache.

This is unlikely to be optimal because we don't have the same information as the browser about the currently available resources.

It is a possible workaround for when devices don't support bundle preloading. We'll use this if we see a need.

## Implementation

### Bundle graph

For each bundle, the **bundle graph** lists what it imports. It is a flat list: a name, then the positions of its static imports, then `-1` and the positions of its QRL imports. A `-2`, `-3` or `-4` right after the name says the bundle holds a handler, another QRL, or only components. For example, `['foo', 'bar', -2, 'myBundle', 0, -1, 1]` means that `foo` and `bar` import nothing, `bar` holds a handler, and `myBundle` imports `foo` statically and `bar` through a QRL.

This is made at build time. Only qrl edges (a module or segment importing its own `$()` segments) are followed. A user or library `import()` is a cut point: nothing under it is preloaded until that code runs and creates its own qrls.

Plugins can add entries to it. The Qwik Router adds every route with its layouts and page. Insights adds to each route the symbols that real visits used there, so a hint for the route preloads them too. Insights also decides which segments share a bundle. Neither changes the order: the bundles they add are sorted by layer and kind like the rest.

### Following a hint

A hint names bundles, symbols or routes. The preloader gives each of them the hint's layer, then does the same for everything they import, static or through a QRL, however far. A bundle already in a layer at least as high is left alone, which also stops the walk on import cycles.

### SSR

We have early preloading, by adding `<link rel="bundlepreload">` tags to the SSR response. This should be used only for the bundles that are almost certain to be needed.

Then, we inject a script tag that imports the preloader and passes the list of likely needed bundles to it. This list depends on the SSR result.

Note that the preloader is a small bundle in a separate bundle that is also imported by Qwik itself, so its state is available instantly. Qwik can then request preloading for QRL segments etc. We tell the bundler to make sure to keep the preloader in a separate bundle.

Once the preloader is loaded, it will start downloading the bundles in the background, in the order described above. It also downloads the bundle graph as soon as possible.

### QRL preloading

When a QRL is created on the client, we hint its bundle at 0.8. When it is called, at 1.

### Link preloading

When a Link is in view and bundle prefetch is on, we hint its route at 0.5, as a page to render. The Qwik Router and Insights plugins add the routes to the bundle graph. A click hints the route at 1, and the page being left at 0.6 so that Back finds its components.

### Actually preloading

Bundles that were hinted wait in a queue sorted by layer, then kind. Highest priority bundles leave it at once. Speculative ones leave it while fewer than `maxIdlePreloads` are loading.
