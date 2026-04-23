import type {
  BlogEntry,
  ExperimentPreset,
  FeatureCard,
  LabEvent,
  ShowcaseMetric,
} from './playground-types';

export const siteNavigation = [
  { href: '/', label: 'Command Center' },
  { href: '/about', label: 'Architecture' },
  { href: '/blog', label: 'Lab Notes' },
] as const;

export const homeMetrics: ShowcaseMetric[] = [
  {
    label: 'Route Surfaces',
    value: '4',
    detail: 'Home, architecture, notes, and one nested article route.',
  },
  {
    label: 'Observation Modes',
    value: '6',
    detail: 'Routing, state, resource, events, context, and devtools visibility.',
  },
  {
    label: 'Latency Presets',
    value: '3',
    detail: 'Switch among calm, balanced, and surge behavior profiles.',
  },
];

export const featureCards: FeatureCard[] = [
  {
    id: 'routing',
    eyebrow: 'Routing Surface',
    title: 'Directory routes feel like product structure, not scaffolding.',
    description:
      'The playground treats routes as narrative beats: command center, architecture, notes, and detail.',
    points: ['Shared shell', 'Nested note route', 'Location-aware navigation'],
    accent: 'cyan',
  },
  {
    id: 'resumability',
    eyebrow: 'Resumability',
    title: 'Signals stay lightweight until an interaction actually matters.',
    description: 'The interface exposes Qwik state without turning the page into a debugger dump.',
    points: ['Signal counters', 'Context-fed cards', 'Low-friction hydration hints'],
    accent: 'lime',
  },
  {
    id: 'resources',
    eyebrow: 'Async Data',
    title: 'Pending, resolved, empty, and failure states are first-class citizens.',
    description:
      'A synthetic resource panel makes latency and state transitions visible at a glance.',
    points: ['Preset latency', 'Scenario toggles', 'Resource lifecycle output'],
    accent: 'amber',
  },
  {
    id: 'events',
    eyebrow: 'Interaction Design',
    title: 'Quick actions mimic the control strips people expect from modern playgrounds.',
    description: 'Preset buttons, scenario switches, and resets give the demo a repeatable rhythm.',
    points: ['Scenario shortcuts', 'Reset actions', 'Readable event timeline'],
    accent: 'violet',
  },
  {
    id: 'state',
    eyebrow: 'State Graph',
    title: 'Store-derived metrics and contextual panels turn raw state into meaning.',
    description:
      'Instead of showing everything, the demo groups state into system health, activity, and payload readiness.',
    points: ['Derived metrics', 'Signal-to-copy mapping', 'Event compression'],
    accent: 'cyan',
  },
  {
    id: 'visibility',
    eyebrow: 'Devtools Visibility',
    title: 'This app is intentionally rich enough to give Qwik Devtools something real to inspect.',
    description:
      'The shell, routes, resources, and controls all create a more representative observation target.',
    points: ['Plugin-ready shell', 'Route-rich flows', 'Live state for inspection'],
    accent: 'lime',
  },
];

export const experimentPresets: ExperimentPreset[] = [
  {
    id: 'soft-glow',
    label: 'Soft Glow',
    latencyMs: 220,
    intensity: 'soft',
    layout: 'grid',
    tone: 'Quiet, precise, and good for route checks.',
    description: 'Fast feedback with restrained motion and quick resource resolution.',
  },
  {
    id: 'signal-mix',
    label: 'Signal Mix',
    latencyMs: 680,
    intensity: 'balanced',
    layout: 'grid',
    tone: 'Balanced for state tracking and async visibility.',
    description: 'The default profile for observing signals, derived metrics, and pending states.',
  },
  {
    id: 'surge-mode',
    label: 'Surge Mode',
    latencyMs: 1200,
    intensity: 'surge',
    layout: 'stack',
    tone: 'High contrast, longer waits, and more dramatic transitions.',
    description: 'Useful when you want to stress the resource panel and route jumps.',
  },
];

export const initialLabEvents: LabEvent[] = [
  {
    id: 'boot',
    label: 'Shell online',
    detail: 'The command center mounted with a shared route shell.',
    time: 'Boot',
    tone: 'success',
  },
  {
    id: 'resource',
    label: 'Resource channel warm',
    detail: 'Async panel is ready to simulate pending and failure states.',
    time: 'Async',
    tone: 'info',
  },
  {
    id: 'devtools',
    label: 'Inspection ready',
    detail: 'The page now exposes enough activity to be useful in devtools.',
    time: 'Observe',
    tone: 'warning',
  },
];

export const aboutPrinciples = [
  {
    title: 'Route shape should teach the product.',
    body: 'Each route demonstrates a different information mode: overview, rules, list, and long-form detail. This makes the demo useful for routing checks instead of only screenshot polish.',
  },
  {
    title: 'State needs narrative, not raw dumps.',
    body: 'Signals, derived values, resource lifecycle, and navigation state are grouped into compact cards so the UI reads like a system console instead of a debug transcript.',
  },
  {
    title: 'Async behavior deserves deliberate stagecraft.',
    body: 'Latency presets and scenario controls let people see pending, empty, and failure modes without wiring a real backend.',
  },
  {
    title: 'Design language should echo the tool it supports.',
    body: 'The palette borrows from the devtools package, but the playground adds its own darker, more atmospheric shell so the app feels intentional rather than copied.',
  },
] as const;

export const visualSystemRules = [
  {
    title: 'Glass surfaces, not flat boxes',
    detail: 'Use layered panels, transparent borders, and soft glow instead of plain cards.',
  },
  {
    title: 'English copy with technical cadence',
    detail: 'Keep content readable for an open-source audience while preserving product voice.',
  },
  {
    title: 'Data-led ornament',
    detail: 'Decorative lines and meters should reinforce state, routes, or resource changes.',
  },
  {
    title: 'CSS-first motion',
    detail: 'Prefer staged transitions and hover depth over JS-only decorative effects.',
  },
] as const;

export const quickJumpCards = [
  {
    href: '/about',
    title: 'Read the architecture notes',
    description: 'See the system rules, visual grammar, and why each route exists in the demo.',
  },
  {
    href: '/blog',
    title: 'Browse lab notes',
    description: 'Open mock experiments with tags, reading time, and one nested article route.',
  },
  {
    href: '/blog/latency-without-chaos',
    title: 'Open the long-form article',
    description:
      'Jump straight into a detailed note to verify nested routing, article layout, and code block styling.',
  },
] as const;

export const blogEntries: BlogEntry[] = [
  {
    slug: 'latency-without-chaos',
    title: 'Latency Without Chaos',
    summary: 'How we simulate async variance without making the playground feel brittle.',
    excerpt:
      'The best playgrounds let people rehearse failure and waiting states with almost no setup. This article explains how the new async panel keeps those states visible but legible.',
    readTime: '6 min read',
    status: 'Fresh',
    publishedAt: 'April 8, 2026',
    tags: ['Async', 'UX', 'State'],
    category: 'Field Study',
    heroMetric: '3 preset lanes',
    sections: [
      {
        heading: 'Why the old demo fell apart under real interaction',
        paragraphs: [
          'The original playground exposed many hooks at once, but it did not teach people what to look at. That meant the demo was technically rich yet narratively thin.',
          'We restructured the async story around a small number of repeatable scenarios. Now pending, empty, and error are intentional states instead of incidental byproducts.',
        ],
        quote:
          'A good playground does not only prove that things work. It proves that waiting, failing, and recovering still feel coherent.',
      },
      {
        heading: 'Preset-driven latency keeps the experiment legible',
        paragraphs: [
          'Each preset establishes a recognizable rhythm. Soft Glow is nearly immediate, Signal Mix holds long enough to show pending UI, and Surge Mode exaggerates delay for inspection.',
          'Because the panel is deterministic, people can use it as a stable test surface while still feeling like they are interacting with something alive.',
        ],
        code: String.raw`const preset = experimentPresets.find(
  (item) => item.id === presetId.value,
);

await new Promise((resolve) => {
  setTimeout(resolve, preset?.latencyMs ?? 600);
});`,
      },
      {
        heading: 'Readable failure is a design feature',
        paragraphs: [
          'Error states use the same panel footprint as success states. That keeps the geometry stable and makes the change feel like a mode shift rather than a collapse.',
          'In a tooling playground, that consistency matters because devtools screenshots and route transitions stay comparable across runs.',
        ],
      },
    ],
  },
  {
    slug: 'routing-as-story-architecture',
    title: 'Routing as Story Architecture',
    summary:
      'A tiny route tree can still feel like a product if each page carries a different informational role.',
    excerpt:
      'Instead of shipping three shallow pages, the new structure uses overview, rules, list, and detail patterns to make the route graph teach itself.',
    readTime: '5 min read',
    status: 'Stable',
    publishedAt: 'April 5, 2026',
    tags: ['Routing', 'Content'],
    category: 'System Note',
    heroMetric: '4 route surfaces',
    sections: [
      {
        heading: 'Structure is part of the demo',
        paragraphs: [
          'Routes tell collaborators what kinds of states the app intends to support. A demo with one page and many cards cannot teach nested content or navigation rhythm.',
        ],
      },
      {
        heading: 'Each page gets a distinct job',
        paragraphs: [
          'The home route acts like a command surface, the about page explains principles, and blog routes provide realistic list-detail navigation.',
        ],
      },
    ],
  },
  {
    slug: 'glass-panels-with-purpose',
    title: 'Glass Panels With Purpose',
    summary:
      'A note on using translucent layers without turning the whole UI into a blur experiment.',
    excerpt:
      'Glassmorphism can quickly become visual fog. The updated playground keeps the effect concentrated in the places where hierarchy and focus benefit from it.',
    readTime: '4 min read',
    status: 'Field Note',
    publishedAt: 'April 2, 2026',
    tags: ['Visual System', 'CSS'],
    category: 'Design Memo',
    heroMetric: '5 surface tiers',
    sections: [
      {
        heading: 'Atmosphere needs contrast',
        paragraphs: [
          'Transparency only works when the background, border, and text contrast are tuned together. The playground uses deep navy fields and sharp cyan accents so the panels stay readable.',
        ],
      },
    ],
  },
];

export const blogTags = ['Async', 'CSS', 'Content', 'Routing', 'State', 'UX'];

export const featuredBlogEntry = blogEntries[0];

export function getBlogEntryBySlug(slug: string) {
  return blogEntries.find((entry) => entry.slug === slug);
}
