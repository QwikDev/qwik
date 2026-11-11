export const reportGuides = {
  applications: {
    purpose: 'Choose the project and environment you want to investigate.',
    steps: [
      'Search by application name or URL, then open its performance overview.',
      'Keep production and preview traffic in separate applications so comparisons reflect the same audience.',
      'For a new project, create an application and connect telemetry and manifest uploads before interpreting empty reports.',
    ],
    meaning:
      'Latest manifest is the most recently recorded build fingerprint; it does not establish that telemetry is still arriving.',
    caution:
      'No manifests yet means there is no recorded build to inspect, rather than proof of healthy performance.',
  },
  dashboard: {
    purpose: 'Find a build that deserves a closer performance investigation.',
    steps: [
      'Check the compared manifests and sample counts before interpreting a change.',
      'Inspect slow symbols and affected routes to narrow down the functions involved.',
      'After changing the application, compare the new build with the same baseline and representative traffic.',
    ],
    meaning:
      'P95 estimates the latency below which 95% of recorded symbol loads fall. Latency measures symbol request to delivery, not function execution time.',
    caution:
      'A percentage change is descriptive, not statistical proof. Traffic mix and small samples can change the result.',
  },
  manifests: {
    purpose: 'Find when symbol-loading behavior changed between builds.',
    steps: [
      'Identify the build you want to investigate using its fingerprint and captured time.',
      'Compare latency distributions and sample counts with a baseline build.',
      'Inspect the corresponding routes and symbols, then repeat the comparison after your next deployment.',
    ],
    meaning:
      'A manifest identifies a build. Samples count recorded symbol loads, not unique visitors. P95 describes the slow tail; the average describes the mean.',
    caution:
      'A lower average can coexist with a higher P95. Captured time is shown in UTC and is not a measurement window.',
  },
  routes: {
    purpose: 'Locate routes whose symbol request timing changed.',
    steps: [
      'Choose a manifest and check its comparison baseline.',
      'Start with routes that have enough samples and a meaningful timing change.',
      'Open a route to inspect the symbols appearing later in its timeline.',
    ],
    meaning:
      'Timeline measures when a symbol was requested relative to a route change. Samples represent symbol requests, not page views.',
    caution:
      'Later requests may be expected user interactions. Timeline P95 is not page-load duration or a Core Web Vital.',
  },
  route: {
    purpose: 'Explain which symbol requests shifted within a route timeline.',
    steps: [
      'Compare the distributions and sample counts for the selected and baseline manifests.',
      'Inspect late symbols and their source to decide whether they belong to initial rendering or a later interaction.',
      'For unexpectedly delayed critical code, inspect loading latency and execution paths before changing bundling or preloading.',
    ],
    meaning:
      'P50, P75, and P95 estimate when 50%, 75%, and 95% of recorded symbol requests occurred. Sample share is a share of requests, not users.',
    caution:
      'Late does not automatically mean slow. A dialog opened later in a visit should request its code later.',
  },
  symbols: {
    purpose: 'Find a function and distinguish gaps between requests from loading latency.',
    steps: [
      'Find the symbol by name, hash, or source file.',
      'Compare its latency distribution and sample count within the selected build scope.',
      'Inspect its source and execution relationships to identify a concrete optimization to test.',
    ],
    meaning:
      'Delay is the gap from the previous symbol delivery to this request. Latency is the time from this request to delivery. Histogram buckets summarize recorded timings.',
    caution:
      'Delay can include time waiting for a user. Neither histogram measures CPU time spent executing the function.',
  },
  symbol: {
    purpose: 'Connect a symbol’s loading behavior to its source and observed routes.',
    steps: [
      'Check the selected and baseline builds and their sample counts.',
      'Inspect source and follow an observed route to reproduce the relevant interaction.',
      'Use execution paths and bundle relationships to evaluate a change, then verify its loading latency in a later build.',
    ],
    meaning:
      'P95 summarizes request-to-delivery latency for this symbol. Source metadata comes from the selected manifest.',
    caution:
      'The GitHub revision is configured per application. Confirm that it matches the selected build before relying on highlighted lines.',
  },
  slow: {
    purpose: 'Prioritize symbol loads that are slow and observed often enough to investigate.',
    steps: [
      'Check the selected manifests and sample counts before ranking outliers.',
      'Inspect the slow tail as well as the average, then open the symbol source.',
      'Use execution paths and bundle relationships to investigate loading waterfalls; compare the next build to verify the change.',
    ],
    meaning:
      'Latency measures request to delivery. P95 describes the slowest part of the observed distribution; the mean may hide those outliers.',
    caution:
      'A handful of slow requests is a lead, not a reliable regression verdict. These counts do not measure affected users.',
  },
  edge: {
    purpose: 'Follow frequently observed symbol sequences to investigate loading waterfalls.',
    steps: [
      'Follow a frequent path through the symbols relevant to the interaction you are investigating.',
      'Inspect source and loading latency along the path to identify code that arrives too late.',
      'Evaluate bundling or preloading changes, then measure the same interaction in the next build.',
    ],
    meaning:
      'Triggered / total compares observations of this incoming edge with all incoming observations for the symbol. Depth is the graph distance from the application root.',
    caution:
      'These are observed sequences, not a JavaScript call stack or proof that one function caused the next.',
  },
  bundles: {
    purpose:
      'Investigate which symbols are used together and may benefit from coordinated loading.',
    steps: [
      'Select a group and inspect its strongest relationships and source files.',
      'Check how much evidence supports a relationship before changing the build strategy.',
      'Use the Insights build integration to evaluate usage-informed bundles, then compare loading latency after deploying.',
    ],
    meaning:
      'These groups are derived from observed execution relationships, not a list of emitted JavaScript files. Darker matrix cells represent stronger similarity scores.',
    caution:
      'A 100% relationship score is not 100% certainty or a predicted speedup. Combining code also changes download size.',
  },
  errors: {
    purpose: 'Identify recurring runtime failures and verify whether a fix stopped them.',
    steps: [
      'Select a recurring error group and inspect its source, stack, route, and manifest.',
      'Reproduce the failure on the affected build and use the source location to investigate.',
      'After deploying a fix, check for new occurrences and confirm telemetry is still arriving.',
    ],
    meaning:
      'This report groups the selected build’s most recent 1,000 events from the last 30 days. Dashboard error groups cover the last 24 hours.',
    caution:
      'No recorded errors can mean either no reported failures or missing telemetry. Counts represent events, not unique users.',
  },
  settings: {
    purpose: 'Connect the application, its build metadata, and its matching source code.',
    steps: [
      'Use the application key in your telemetry and Insights build integration, keeping preview and production separate.',
      'Configure a public GitHub repository, source directory, and revision matching the build you are inspecting.',
      'Verify a symbol source preview and grant access only to the people who need the reports.',
    ],
    meaning:
      'A commit pins source exactly. A branch moves over time, and one application-wide revision may not match historical manifests.',
    caution:
      'A configured repository alone cannot supply missing symbol metadata. The build must also upload its manifest.',
  },
} satisfies Record<string, { purpose: string; steps: string[]; meaning: string; caution: string }>;

export type ReportGuideId = keyof typeof reportGuides;
