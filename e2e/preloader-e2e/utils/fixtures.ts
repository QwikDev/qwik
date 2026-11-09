export const PRIMITIVE_STEPS = {
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
    expected: String(2 ** (levels * steps)),
  }))
);

export const MODAL: Fixture = {
  id: 'modal/modal',
  path: '/modal/',
  sources: ['src/components/fixtures/modal/', 'src/routes/modal/'],
  expected: '4',
};

export const USER_IMPORT: Fixture = {
  id: 'user-import/user-import',
  path: '/user-import/',
  sources: ['src/components/fixtures/user-import/', 'src/routes/user-import/', 'src/vendor-lib/'],
  warmRoundTrips: 1,
};

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
  expected: '8',
};

export const VISIBLE_BELOW: Fixture = {
  id: 'visible/below',
  path: '/visible/below/',
  sources: ['src/components/fixtures/visible/below.tsx', 'src/routes/visible/below/'],
  expected: '8',
};

export const fixtureById = (id: string) => MATRIX.find((fixture) => fixture.id === id)!;

export const CLICKABLE_ON_ALL_AT_ONCE: Fixture[] = [...MATRIX, USER_IMPORT, MODAL].map(
  (fixture) => ({ ...fixture, path: '/all-at-once/' })
);

const NEVER_UPDATES =
  'never shows its result on main: a sync computed reading an async computed prop stays at 0';
const OFF_SCREEN_VISIBLE_TASKS =
  'needs a round trip on main: off-screen visible task chunks are never preloaded, so scrolling to them fetches them';
const MIDDLE_LINK_LATE =
  'over the 2-round-trip cap on main: the middle link of an async computed chain loads a round trip late';

export const NEVER_SHOWS_RESULT: Record<string, string> = {
  'tree/mixed-computed-chain': NEVER_UPDATES,
  'tree-context/mixed-computed-chain': NEVER_UPDATES,
};

export type RoundTripsOnMain = { roundTrips: number; reason: string };

export const NOT_READY_WHEN_WARM: Record<string, RoundTripsOnMain> = {
  'tree-context/visible-task-chain': { roundTrips: 1, reason: OFF_SCREEN_VISIBLE_TASKS },
};

export const OVER_THE_CAP: Record<string, RoundTripsOnMain> = {
  'single/async-computed-chain': { roundTrips: 3, reason: MIDDLE_LINK_LATE },
  'single/mixed-computed-chain': { roundTrips: 3, reason: MIDDLE_LINK_LATE },
  'tree/async-computed-chain': { roundTrips: 6, reason: MIDDLE_LINK_LATE },
  'tree-context/async-computed-chain': { roundTrips: 6, reason: MIDDLE_LINK_LATE },
};

export const snapshotName = (fixture: Fixture, scenario: string) =>
  `${fixture.id.replace('/', '--')}.${scenario}.txt`;

export const NAVIGATION_SOURCES = ['src/components/fixtures/navigation/', 'src/routes/navigation/'];
