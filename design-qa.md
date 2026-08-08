# Design QA

- Reference: Penpot board `d7ad82be-1de1-8059-8008-4fc6be52d3aa`
- Target viewport: 1440 × 1024
- Implementation: `packages/insights/src/routes/app/index.tsx`
- Reference capture: passed
- Production client build: passed
- Focused database tests: passed
- Focused ESLint: passed
- TypeScript: blocked by the pre-existing duplicate `QwikRouterPlatform` identifier in
  `packages/insights/src/entry.netlify-edge.tsx:14`
- P1 layout finding: the application sidebar stacked below the list in the supplied desktop
  screenshot. Fixed by moving this screen's two-column switch to the standard `lg` breakpoint.
- Visual comparison: blocked because an in-app browser is unavailable and Playwright Chromium has
  not been approved for this workspace; the corrected layout still needs a fresh capture

## Add application

- Reference: Penpot board `cf68e076-4315-8007-8008-4fb03610d434`
- Target viewport: 1440 × 1024
- Implementation: `packages/insights/src/routes/app/add/index.tsx`
- Reference capture: passed
- Production client build: passed
- Focused ESLint: passed
- TypeScript: blocked only by the pre-existing duplicate `QwikRouterPlatform` identifier in
  `packages/insights/src/entry.netlify-edge.tsx:14`
- Navigation: a reusable back action links the add screen to `/app/`
- Visual comparison: blocked because an in-app browser is unavailable and Playwright Chromium has
  not been approved for this workspace

## Application navigation

- Source visual truth: Penpot board `891037c9-970a-8072-8008-6198dfe6d21c`, component
  `Signed-in Navigation Expanded`
- Target viewport and state: 1440 × 1024 CSS px at 1× density, navigation always expanded
- Source capture: focused 256 × 1024 px navigation export inspected
- Implementation: `packages/insights/src/components/application-navigation/index.tsx`
- Implementation capture: unavailable because the protected local route requires the user's
  authenticated browser session
- Primary navigation behavior: exact Dashboard matching and nested section matching covered by a
  focused unit test
- Automated checks: 8 focused tests, Prettier, ESLint, and diff validation passed
- TypeScript: blocked only by the pre-existing duplicate `QwikRouterPlatform` identifier in
  `packages/insights/src/entry.netlify-edge.tsx:14`
- Full-view and focused comparison: blocked because an in-app browser is unavailable and Playwright
  Chromium has not been approved for this workspace

## Compact histogram

- Source visual truth:
  `/home/michal/.codex/generated_images/019f4c67-8bab-7330-9f72-73b3ef6a175f/call_YLv89Y47MLvKmLRLLBpphiP5.png`
- Source pixels: 2152 × 731; intended component size: 560 × 190 CSS px at 1× density
- Target state: compact latency histogram with a bucket hovered or keyboard-focused
- Implementation: `packages/insights/src/components/histogram/index.tsx`
- Implementation screenshot: unavailable because the protected route requires the user's
  authenticated browser session
- Fonts and typography: Inter and existing editorial text tokens retained; visual comparison blocked
- Spacing and layout: compact token-based plot, axis, tooltip, and bars implemented; visual
  comparison blocked
- Colors and tokens: existing editorial semantic and data-series tokens used; visual comparison
  blocked
- Image quality and assets: no image assets are present in the source component
- Copy: readable duration ranges and singular/plural sample labels covered by focused tests
- Automated checks: 10 focused tests, Prettier, ESLint, and diff validation passed
- TypeScript: blocked only by the pre-existing duplicate `QwikRouterPlatform` identifier in
  `packages/insights/src/entry.netlify-edge.tsx:14`
- Full-view and focused comparison: blocked because an in-app browser is unavailable and Playwright
  Chromium has not been approved for this workspace

## Edge graph

- Source visual truth: Penpot board `cf68e076-4315-8007-8008-4faf7359cacf`
- Source pixels and viewport: 1440 x 1024 CSS px at 1x density
- Source capture: inspected after removing the tree panel fill, stroke, and radius
- Implementation: `packages/insights/src/routes/app/[publicApiKey]/symbols/edge/index.tsx`
- Implementation screenshot path and pixels: unavailable because the protected route requires the
  user's authenticated browser session and no user-approved browser is available in this session
- Target state: page 1 with real edge data, Previous disabled, and Next enabled when another page
  exists
- Fonts and typography: existing editorial sans and mono tokens are used; visual comparison blocked
- Spacing and layout: Penpot-derived header, pagination, legend, open-canvas tree, node spacing, and
  solid hierarchy rails are implemented with existing editorial spacing tokens; visual comparison
  blocked
- Colors and tokens: the large white panel was removed; existing canvas, semantic, accent, border,
  and data-series tokens are used; visual comparison blocked
- Image quality and assets: the source contains no raster imagery; existing SymbolTile iconography is
  reused
- Copy and content: the header explains the 100-manifest window; counts, symbol hashes, and depths use
  loader data rather than placeholders
- Primary interactions: Previous and Next use the shared Button and ButtonLink components and preserve
  query-string pagination; browser interaction testing is blocked
- Automated checks: 7 focused edge-tree tests, Prettier, ESLint, diff validation, client build, and
  server build passed
- Full-view and focused comparison: blocked because the implementation cannot be captured in the
  user's authenticated browser; no P0/P1/P2 visual iteration can be claimed without that evidence

## Bundles canvas

- Source visual truth: Penpot board `483e883e-3fd8-8092-8008-6715e35560a8`
- Source pixels and viewport: 1440 x 1024 CSS px at 1x density
- Source capture: inspected; the layout already uses the application canvas without an outer white
  card
- Implementation: `packages/insights/src/routes/app/[publicApiKey]/symbols/bundles/index.tsx`
- Implementation screenshot path and pixels: unavailable because the protected route requires the
  user's authenticated browser session and no user-approved browser is available in this session
- Target state: selected bundle with the relationship matrix and symbol evidence visible
- Fonts and typography: existing editorial sans and mono tokens are unchanged; visual comparison
  blocked
- Spacing and layout: the outer radius and enclosing card border were replaced with horizontal
  section separators; the matrix layout is unchanged
- Colors and tokens: the enclosing white surface and sticky white table header were replaced with
  the existing canvas token; selected and hover states are unchanged
- Image quality and assets: no raster imagery is present and existing symbol iconography is retained
- Copy and content: unchanged
- Primary interactions and console: browser testing is blocked; bundle selection logic is unchanged
- Automated checks: Prettier, ESLint, diff validation, and client build passed
- Full-view and focused comparison: blocked because the implementation cannot be captured in the
  user's authenticated browser; no P0/P1/P2 visual iteration can be claimed without that evidence

final result: blocked
