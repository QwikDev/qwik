# Preloading

(this is wip, need to explain how bundlegraph stores score modifiers and how they are used)

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

### Bundle scoring system

Each bundle gets some metrics that will be used to score it. The scoring should help us decide which bundles to preload first.

- Interactivity: How much impact to interactivity is there if the bundle is missing?
  - score 0 to 5
  - a click handler is very interactive, but the Task that gets executed by the signal that changes might also be important
  - qwik core is not interactive directly, so it gets 0.
- Size: How much code is there to download?
  - score: percentage of total js bundle size, including all static imports and their static imports etc
  - heavy bundles that are not interactive should not be preloaded at all, but very interactive bundles should be preloaded before others, so that smaller bundles can download in parallel.
- Likelihood of being needed
  - score: chance % of being needed in the next 5 seconds
    - this is a guess, based on the type of symbols in the bundle and the type of the bundle
    - dependencies get the sum score of their importers
    - Insights can be used to improve this guess, but this is only implemented for Link SPA preloading and bundle bundling.
    - this also changes during execution: importing one bundle can increase the score of another. The extreme case is direct imports, they are then 100% sure to be needed.

## Available techniques

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

Ideally, we have a function that gets the current DOM, the browser position and the user interaction history and returns the likelihoods of the bundles. Perhaps one day we can use a neural network to do this, but for now we use simple heuristics.

For each bundle, we have a list of scoring modifiers for other bundles. These are numbers that are added to the score of the bundle.

We encode the scores in a "bundle graph". This is a compact representation of the known bundles and how they influence the likelihood of other bundles.

### SSR

We have early preloading, by adding `<link rel="bundlepreload">` tags to the SSR response. This should be used only for the bundles that are almost certain to be needed.

Then, we inject a script tag that imports the preloader and passes the list of likely needed bundles to it. This list depends on the SSR result.

Note that the preloader is a small bundle in a separate bundle that is also imported by Qwik itself, so its state is available instantly. Qwik can then request preloading for QRL segments etc. We tell the bundler to make sure to keep the preloader in a separate bundle.

Once the preloader is loaded, it will start downloading the bundles in the background in order of their score. It also downloads the bundle graph so to have a complete picture.

### QRL preloading

When a QRL is created, we tell the preloader about the symbol with low priority.

### Link preloading

When a Link is visible, we can preload the likely bundles of the target page. The scoring could also use the popularity of target page, but this is not implemented yet.
