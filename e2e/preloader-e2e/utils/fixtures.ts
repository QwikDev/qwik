export const PRIMITIVE_STEPS = {
  'jsx-binding': 0,
  render: 1,
  'store-chain': 3,
  'task-chain': 3,
  'computed-chain': 3,
  'async-computed-chain': 3,
  'mixed-computed-chain': 3,
  'visible-task-chain': 3,
  all: 12,
};

export const SETUP_LEVELS = { single: 1, tree: 3, 'tree-context': 3, conditional: 3 };

export type Fixture = {
  id: string;
  path: string;
  sources: string[];
  expected?: string;
  warmRoundTrips?: number;
};

export const MATRIX: Fixture[] = Object.entries(SETUP_LEVELS).flatMap(([setup, levels]) =>
  Object.entries(PRIMITIVE_STEPS).map(([primitive, steps]) => ({
    id: `${setup}/${primitive}`,
    path: `/${setup}/${primitive}/`,
    sources: [
      `src/components/fixtures/${setup}/${primitive}/`,
      `src/routes/${setup}/${primitive}/`,
    ],
    expected: String(1 + levels * steps),
  }))
);

export const MODAL: Fixture = {
  id: 'modal',
  path: '/modal/',
  sources: ['src/components/fixtures/modal/', 'src/routes/modal/'],
  expected: '3',
};

export const USER_IMPORT: Fixture = {
  id: 'user-import',
  path: '/user-import/',
  sources: ['src/components/fixtures/user-import/', 'src/routes/user-import/', 'src/vendor-lib/'],
  warmRoundTrips: 1,
};

export const SHARED_HELPER: Fixture = {
  id: 'shared-helper',
  path: '/shared-helper/',
  sources: ['src/components/fixtures/shared-helper/', 'src/routes/shared-helper/'],
  expected: '1 clicks',
};

const handWritten = (name: string, expected: string): Fixture => ({
  id: name,
  path: `/${name}/`,
  sources: [`src/components/fixtures/${name}/`, `src/routes/${name}/`],
  expected,
});

export const SLOT = handWritten('slot', '1');
export const CONDITIONAL_MODAL = handWritten('conditional-modal', 'ready');
export const SCOPED_STYLES = handWritten('scoped-styles', 'styled');
export const QRL_PROP = handWritten('qrl-prop', '42');
export const SYNC = handWritten('sync', 'done');
export const BARREL = handWritten('barrel', 'alpha 1.0');

const overPreloading = (name: string): Fixture => ({
  id: `over-preloading/${name}`,
  path: `/over-preloading/${name}/`,
  sources: [`src/routes/over-preloading/${name}/`],
  expected: 'theme-dark',
});

export const CLICK_RUNS_COMPUTED = overPreloading('click-computed');
export const CLICK_RUNS_TASK = overPreloading('click-task');
export const CLICK_RUNS_TASK_CALLING_QRL = overPreloading('click-task-calling-qrl');
export const VISIBLE_TASK_RUNS_COMPUTED = overPreloading('visible-task-computed');
export const VISIBLE_TASK_RUNS_TASK = overPreloading('visible-task-task');
export const VISIBLE_TASK_RUNS_TASK_CALLING_QRL = overPreloading('visible-task-task-calling-qrl');

export const IMPORT_CHAIN: Fixture = {
  id: 'harness/import-chain',
  path: '/harness/import-chain/',
  sources: ['src/components/fixtures/harness/', 'src/routes/harness/'],
  expected: 'done',
};

export const VISIBLE_ABOVE: Fixture = {
  id: 'visible/above',
  path: '/visible/above/',
  sources: ['src/components/fixtures/visible/above.tsx', 'src/routes/visible/above/'],
  expected: '4',
};

export const VISIBLE_BELOW: Fixture = {
  id: 'visible/below',
  path: '/visible/below/',
  sources: ['src/components/fixtures/visible/below.tsx', 'src/routes/visible/below/'],
  expected: '4',
};

const visibleStrategy = (strategy: string): Fixture => ({
  id: `visible/${strategy}`,
  path: `/visible/${strategy}/`,
  sources: [`src/components/fixtures/visible/${strategy}.tsx`, `src/routes/visible/${strategy}/`],
  expected: '4',
});

export const VISIBLE_DOCUMENT_READY = visibleStrategy('document-ready');
export const VISIBLE_DOCUMENT_IDLE = visibleStrategy('document-idle');

export const fixtureById = (id: string) => {
  const fixture = MATRIX.find((candidate) => candidate.id === id);
  if (!fixture) {
    throw new Error(`No fixture has the id ${id}`);
  }
  return fixture;
};

export const CLICKABLE_ON_ALL_AT_ONCE: Fixture[] = [...MATRIX, USER_IMPORT, MODAL].map(
  (fixture) => ({ ...fixture, path: '/all-at-once/' })
);

const NEVER_UPDATES =
  'never shows its result on main: a sync computed reading an async computed prop stays at 0';
const OFF_SCREEN_VISIBLE_TASKS =
  'needs a round trip on main: off-screen visible task chunks are never preloaded, so the scroll to the first visible-task-chain fixture fetches them all';
const JSX_ONLY =
  'one round trip on main: the signal is only read in JSX, so the click only needs its handler';
const COMPUTEDS_WITH_HANDLER =
  'one round trip on main: the computed chunks go out with the click handler';
const VISIBLE_TASKS_LOADED =
  'one round trip on main: the visible task chunks loaded with the page, so the click only needs its handler';
const TASKS_WITH_HANDLER =
  "one round trip on main: the click handler's chunk also holds the component's tasks";
const HANDLER_LOADED_WITH_THE_PAGE =
  "no round trip on main: the in-view visible tasks loaded each component's interaction chunk, which holds the handler, with the page";
const TASKS_FOUND_LEVEL_BY_LEVEL =
  "over the 2-round-trip cap on main: each component's tasks are only found once the level above has run";
const RENDER_FOUND_AFTER_TASK =
  "over the 2-round-trip cap on main: the modal's task loads first, and its render chunk is only found once the task has run";

export const NEVER_SHOWS_RESULT: Record<string, string> = {
  'tree/mixed-computed-chain': NEVER_UPDATES,
  'tree-context/mixed-computed-chain': NEVER_UPDATES,
};

export type RoundTripsOnMain = { roundTrips: number; reason: string };

export const NOT_READY_WHEN_WARM: Record<string, RoundTripsOnMain> = {
  'single/visible-task-chain': { roundTrips: 1, reason: OFF_SCREEN_VISIBLE_TASKS },
};

export const ROUND_TRIPS_ON_MAIN: Record<string, RoundTripsOnMain> = {
  'single/jsx-binding': { roundTrips: 1, reason: JSX_ONLY },
  'tree/jsx-binding': { roundTrips: 1, reason: JSX_ONLY },
  'tree-context/jsx-binding': { roundTrips: 1, reason: JSX_ONLY },
  'single/computed-chain': { roundTrips: 1, reason: COMPUTEDS_WITH_HANDLER },
  'tree/computed-chain': { roundTrips: 1, reason: COMPUTEDS_WITH_HANDLER },
  'tree-context/computed-chain': { roundTrips: 1, reason: COMPUTEDS_WITH_HANDLER },
  'single/visible-task-chain': { roundTrips: 1, reason: VISIBLE_TASKS_LOADED },
  'tree/visible-task-chain': { roundTrips: 1, reason: VISIBLE_TASKS_LOADED },
  'tree-context/visible-task-chain': { roundTrips: 1, reason: VISIBLE_TASKS_LOADED },
  'single/async-computed-chain': { roundTrips: 1, reason: COMPUTEDS_WITH_HANDLER },
  'single/mixed-computed-chain': { roundTrips: 1, reason: COMPUTEDS_WITH_HANDLER },
  'single/store-chain': { roundTrips: 1, reason: TASKS_WITH_HANDLER },
  'single/task-chain': { roundTrips: 1, reason: TASKS_WITH_HANDLER },
  'single/all': { roundTrips: 0, reason: HANDLER_LOADED_WITH_THE_PAGE },
  'tree/all': { roundTrips: 0, reason: HANDLER_LOADED_WITH_THE_PAGE },
  'tree-context/all': { roundTrips: 0, reason: HANDLER_LOADED_WITH_THE_PAGE },
  'tree/store-chain': { roundTrips: 3, reason: TASKS_FOUND_LEVEL_BY_LEVEL },
  'tree/task-chain': { roundTrips: 3, reason: TASKS_FOUND_LEVEL_BY_LEVEL },
  'tree-context/store-chain': { roundTrips: 3, reason: TASKS_FOUND_LEVEL_BY_LEVEL },
  'tree-context/task-chain': { roundTrips: 3, reason: TASKS_FOUND_LEVEL_BY_LEVEL },
  modal: { roundTrips: 3, reason: RENDER_FOUND_AFTER_TASK },
};

export const NAVIGATION_SOURCES = ['src/components/fixtures/navigation/', 'src/routes/navigation/'];
