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

To know which code is most likely to be needed, we can use the bundle scoring system.

We will err on the side of caution, so if we are not sure, we will preload the bundle. This is better than making the user wait. In the end, all of the code that might be needed for the current page should be preloaded. However, we should make sure that bundles that are more likely to be needed are preloaded first.

However, on low-end devices, we may decide to not preload low-likelihood bundles.

### Bundle scoring system

Ideally, we have a function that gets the current DOM, the browser position and the user interaction history and returns the likelihoods of the bundles. Perhaps one day we can use a neural network to do this, but for now we use heuristics.

Each bundle gets some metrics that will be used to score it. The scoring should help us decide which bundles to preload first.

### Metrics

- Interactivity: How much impact to interactivity is there if the bundle is missing?
  - score 0.0 to 1.0
  - this is determined at build time
  - a click handler is very interactive, but the Task that gets executed by the signal that changes might also be important
  - qwik core and other libraries are not interactive directly, so it gets 0. However, it will get higher probability via its importers.
- Size: How much code is there to download?
  - score: number of seconds it takes to download at slow mobile speed, currently set at 200kbps, so 1 second is 200/8 = 25kB
  - this is determined at build time
  - heavy bundles that are not interactive should not be preloaded at all, but very interactive bundles should be preloaded before others, so that smaller bundles can download in parallel.

### Likelihood calculation

We're interested in the probability of a bundle being needed in the next 5 seconds (0.0 to 1.0)

- this is a runtime guess, based on the interactivity of the bundle, for handlers its location on the page, and any the already-loaded bundles that import it
- Insights can be used to improve this guess with real data, but this is only implemented for Link SPA preloading and bundle bundling.
- this also changes during execution: importing one bundle can increase the score of another. The extreme case is direct imports, they are then 100% sure to be needed.
- dependencies get adjustments when importers run. For example, if an importer bundle has a probability of `0.5` and it imports this bundle with a probability of `0.5`, the probability is `0.5 * 0.5 = 0.25`. If another bundle has a probability of `0.25` and imports this bundle with a probability of `0.75`, the probability is `0.25 * 0.75 = 0.1875`. When both importers are present, the total probability is `1 - (1 - 0.5) * (1 - 0.25) = 0.6875`.

Generally speaking, the probability of a bundle loading because of importers is `1 - (1 - p1) * (1 - p2) * ...` where `p1`, `p2`, ... are the probabilities of each importer not importing this bundle, which is the product of the probabilities of each importer not importing this bundle). Furthermore we have the base probability of the bundle. That can be seen as an importer with a probability of `1`.

So, for each bundle we keep track of the inverse probability. We start with the 1 - the base probability, and when an importer runs, we multiply with its inverse probability.

The likelihood score is then derived as follows:

- `score = 0.5 * probability + 0.5 * interactivity`

This means that a bundle that is both interactive and has a high probability will get a high score, but a bundle that is only interactive or only likely will get a lower score.

### SSR probability

During SSR, we discover the QRL segments that are used in the result, both from event handlers and from state (e.g. computed signals). We then use this to calculate the probability of their bundle being needed.

For event handlers, we can use the type of event for interactivity scoring as well as probability of the handler being called. Visible tasks and computed signal QRLs will have a high probability, onClick handlers will have a medium probability but high interactivity, etc.

We can then generate a list of bundles in their order of likelihood. We provide this list to the preloader, and anything with a score > 0.8 will get an initial preload tag.

This will e.g. automatically add the bundle containing Qwik Core as a tag to the result.

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

For each bundle, we have a list of probabilities for other bundles. We encode these as a list of numbers and call it the **bundle graph**: a positive number is the index of the dependency, and a negative number is the probability times `-10` and applies to the bundles following it. For example, `['foo', 'bar', 'myBundle', 0, -6, 1]` means that the bundles `foo` and `bar` don't import anything, and importing `myBundle` gives a 100% chance to import `foo` (meaning it's a direct import) and a 60% chance to import `bar`.

This is made at build time. For dynamic imports, we have to guess the probability of the bundle if it is not provided by Insights.

A bundle has many origins. The probability is the highest of the probabilities of the origins.

Some examples of factors influencing the probability:

- a `component$` will be 100% likely to import its own hook qrls
- ...

### Runtime probability

All bundles start with no probability, meaning their inverse probability `iP` is `1`.

Suppose we think a bundle has a 60% chance of being needed. This updates its `iP` to `0.4` and all its imports get their `iP` multiplied by `(1 - 0.6 * probability)`.

When the bundle gets imported, this changes to 100%, `iP = 0`. This again updates it and all its imports. However, the imports were already adjusted, so the `iP` of the imports is now multiplied by `(1 - 1 * probability)/(1 - 0.6 * probability)`.

In other words, when you change the `iP` of a bundle, you have to adjust the `iP` of all its imports by `( 1 - (1 - iP)*probability)/(1 - (1 - prevIP)*probability)`.

### SSR

We have early preloading, by adding `<link rel="bundlepreload">` tags to the SSR response. This should be used only for the bundles that are almost certain to be needed.

Then, we inject a script tag that imports the preloader and passes the list of likely needed bundles to it. This list depends on the SSR result.

Note that the preloader is a small bundle in a separate bundle that is also imported by Qwik itself, so its state is available instantly. Qwik can then request preloading for QRL segments etc. We tell the bundler to make sure to keep the preloader in a separate bundle.

Once the preloader is loaded, it will start downloading the bundles in the background in order of their score. It also downloads the bundle graph as soon as possible.

### QRL preloading

When a QRL is created, we tell the preloader about the symbol having a 60% chance.
When a it is called, we change the probability to 100%.

### Link preloading

When a Link is visible and preload is requested, we preload its route destination. The Qwik Router and Insights plugins will have added these to the bundle graph. The scoring could also use the popularity of target page, but this is not implemented yet.

### Actually preloading

When a bundle's `iP` is below `1`, we put it in a sorted set. Our first naive implementation will just sort the array of desired bundles by increasing `iP`.

The lower the `iP`, the more urgent the preload is. For bundles with `iP < 0.05`, we preload all. For the rest, we take the number of active preloads. If `preloadCount < 2 + 20 * (1 - iP)`, we preload it.
