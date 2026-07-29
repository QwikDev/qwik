# Routes design QA

- Source visual truth: Penpot board `6a2feed4-b559-80ee-8008-4f841277fd5b`
- Routes list screenshot: `/tmp/insights-routes-list.png`
- Route detail screenshot: `/tmp/insights-route-detail-final.png`
- Responsive detail screenshot: `/tmp/insights-route-detail-narrow-final.png`
- Source pixels: 1440 × 1024
- Desktop implementation viewport: 1328 × 1024 CSS pixels at 1× density
- Desktop full-page capture: 1328 × 1081 pixels
- Responsive viewport: 768 × 1200 CSS pixels at 1× density
- Responsive full-page capture: 768 × 1492 pixels
- State: one real route copied into a temporary local QA database, latest and previous manifests

## Comparison

The Penpot source and final route-detail render were opened together in one comparison input. The
implementation capture isolates the content region because the existing shared Insights shell
remains unchanged.

- Inter and Roboto Mono match the source hierarchy and code treatment.
- Header, status callout, chart/summary split, table, spacing, borders, and radii match the Penpot
  composition.
- Existing `editorial-*` tokens reproduce the source palette. A reusable tall-chart spacing token
  was added for this distribution.
- The comparative histogram uses the existing component, with paired manifest bars, grid lines,
  keyboard-focusable buckets, and a shared tooltip.
- No image assets are present in the compared content region.
- Copy and metrics intentionally use stored timeline samples and manifests rather than unavailable
  request latency, sessions, deployment time ranges, or targets.

Focused comparison covered the status callout, paired histogram, summary metrics, and late-symbols
table. All text remained readable in the full-view captures, so no additional crop was required.

## Interaction and responsive checks

- Focusing a populated histogram bucket opens its comparative tooltip.
- `Review symbols` moves focus context to the late-symbols section.
- Route links preserve the complete opaque route in one encoded URL segment.
- The manifest selector offers the last 100 manifests and preserves the selection in route-detail
  URLs.
- No browser console or page errors were reported.
- At 768 pixels, the summary stacks below the chart, the table scrolls locally, and the page has no
  horizontal overflow.

## Findings

No actionable P0, P1, or P2 differences remain.

The visible data differs from the Penpot example because the QA render uses stored production
timeline samples. Missing source paths are shown explicitly as unavailable.

## Comparison history

1. The first render used the compact 104-pixel histogram and allowed one-off outliers to lead the
   symbol table.
2. The histogram was expanded to the Penpot-like 204-pixel height with wider paired bars and grid
   lines. Symbols below one percent of route samples were removed from the late-symbols ranking.
3. The final desktop and responsive captures had no remaining actionable P0, P1, or P2 findings.

The manifest selector was added after these captures and verified with focused tests, lint, and the
client build.

final result: passed
