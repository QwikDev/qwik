# Bundle affinity prototype

Run from the repository root:

```sh
pnpm --filter insights dev.bundles
```

Open http://localhost:5188/. The standalone playground uses 120 synthetic storefront symbols and
synthetic execution vectors; no database, login, telemetry upload, or production credentials are
needed. It shares the clustering implementation with the actual Bundles page.

Drag the slider to regroup immediately, click a bundle to inspect its symbols, and reset to return
to the current automatic threshold. Higher affinity means stricter similarity and more groups;
the count can jump. Identical vectors stay together even at maximum affinity.

The authenticated Bundles page also includes the slider. Run the regular Insights dev server with
the database and authentication configuration described in the app README to use recorded telemetry.
Previews never persist settings or change the build strategy endpoint.

The server calculates a minimum spanning tree of Euclidean distances once per page load. The browser
cuts that tree at the selected threshold, reproducing the existing DBSCAN groups at 50% while
avoiding repeated distance calculations or network requests during dragging. Preview relationship
lists use the visible matrix cells; automatic mode retains the original complete relationship list.
