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

final result: blocked
