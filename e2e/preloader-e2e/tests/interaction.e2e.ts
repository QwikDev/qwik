import { expect, test, type Page } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import {
  chunkComesFrom,
  chunkHasComponent,
  chunkHasScopedStyles,
  chunkHoldsComputedFrom,
  chunkHoldsTaskFrom,
} from '../utils/app';
import {
  BARREL,
  MATRIX,
  MODAL,
  NEVER_SHOWS_RESULT,
  QRL_PROP,
  SCOPED_STYLES,
  SHARED_HELPER,
  SLOT,
  SYNC,
  TASK_READING_A_COMPUTED_FROM_A_RERENDERING_PARENT,
  TASK_READING_A_COMPUTED_FROM_CONTEXT,
  TASKS_IN_PARENT_AND_CHILD,
  TASKS_IN_SIBLINGS,
  USER_IMPORT,
  type Fixture,
} from '../utils/fixtures';
import { releaseAll, settle, type RoundTrip } from '../utils/gate';
import {
  coldClick,
  expectResult,
  fixtureResult,
  fixtureRoot,
  openFixture,
} from '../utils/scenarios';

for (const fixture of [...MATRIX, MODAL]) {
  if (!fixture.startsWhenVisible) {
    defineColdClickTest(fixture);
  }
}

const requestedUrls = (roundTrips: RoundTrip[]) =>
  roundTrips.flatMap((roundTrip) => roundTrip.urls);

const roundTripOf = (roundTrips: RoundTrip[], isWanted: (url: string) => boolean) =>
  roundTrips.findIndex((roundTrip) => roundTrip.urls.some(isWanted));

test("slot: a click inside projected content doesn't fetch the projecting component's render chunk", async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SLOT);
  const panelChunks = requestedUrls(roundTrips).filter((url) =>
    chunkComesFrom(url, ['src/components/fixtures/slot/panel.tsx_'])
  );
  expect(panelChunks).toEqual([]);
});

test('scoped-styles: a component shown on click fetches its scoped styles with its render chunk', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SCOPED_STYLES);
  const stylesRoundTrip = roundTripOf(roundTrips, chunkHasScopedStyles);
  const renderRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, [
      'src/components/fixtures/scoped-styles/styled-card.tsx_StyledCard_component',
    ])
  );
  expect(stylesRoundTrip).toBeGreaterThanOrEqual(0);
  expect(stylesRoundTrip).toBe(renderRoundTrip);
});

test('qrl-prop: a click calling a QRL passed down as a prop fetches it with the handler', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, QRL_PROP);
  const handlerRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, ['src/components/fixtures/qrl-prop/action-button.tsx_'])
  );
  const qrlRoundTrip = roundTripOf(roundTrips, (url) =>
    chunkComesFrom(url, ['src/components/fixtures/qrl-prop/index.tsx_'])
  );
  expect(handlerRoundTrip).toBeGreaterThanOrEqual(0);
  expect(qrlRoundTrip).toBeGreaterThanOrEqual(0);
  test.fail(
    true,
    "on main, the QRL from the parent's file is only requested once the child's handler runs it, a round trip later"
  );
  expect(qrlRoundTrip).toBe(handlerRoundTrip);
});

test('sync: a click handled only by sync$ shows the result with no request, even cold', async ({
  page,
}) => {
  const roundTrips = await coldClick(page, SYNC);
  expect(roundTrips).toHaveLength(0);
});

const RENDERS_NOTHING_ON_CLICK = [
  'jsx-binding',
  'store-chain',
  'task-chain',
  'computed-chain',
  'async-computed-chain',
  'mixed-computed-chain',
  'all',
];

test.describe('clicks that render nothing', () => {
  for (const fixture of MATRIX) {
    const [setup, primitive] = fixture.id.split('/');
    if (
      setup === 'conditional' ||
      !RENDERS_NOTHING_ON_CLICK.includes(primitive) ||
      NEVER_SHOWS_RESULT[fixture.id]
    ) {
      continue;
    }
    test(`${fixture.id}: a cold click fetches no chunk holding a component qrl`, async ({
      page,
    }) => {
      const roundTrips = await coldClick(page, fixture);
      const componentChunks = requestedUrls(roundTrips).filter(chunkHasComponent);
      expect(componentChunks).toEqual([]);
    });
  }
});

const TASKS_DIR = 'src/components/fixtures/tasks/';

test.describe('tasks in several components', () => {
  test("a click that makes a parent's and its child's tasks dirty fetches both task chunks in one round trip", async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, TASKS_IN_PARENT_AND_CHILD);
    const parentRoundTrip = roundTripOf(roundTrips, (url) =>
      chunkHoldsTaskFrom(url, `${TASKS_DIR}parent-child/index.tsx`)
    );
    const childRoundTrip = roundTripOf(roundTrips, (url) =>
      chunkHoldsTaskFrom(url, `${TASKS_DIR}parent-child/child.tsx`)
    );
    expect(parentRoundTrip).toBeGreaterThanOrEqual(0);
    test.fail(
      true,
      "on main, core asks for a child's task chunk only once its parent's tasks have run"
    );
    expect(childRoundTrip).toBe(parentRoundTrip);
  });

  test("a click that makes two sibling components' tasks dirty fetches both task chunks in one round trip", async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, TASKS_IN_SIBLINGS);
    const firstRoundTrip = roundTripOf(roundTrips, (url) =>
      chunkHoldsTaskFrom(url, `${TASKS_DIR}siblings/first.tsx`)
    );
    const secondRoundTrip = roundTripOf(roundTrips, (url) =>
      chunkHoldsTaskFrom(url, `${TASKS_DIR}siblings/second.tsx`)
    );
    expect(firstRoundTrip).toBeGreaterThanOrEqual(0);
    expect(secondRoundTrip).toBe(firstRoundTrip);
  });

  const countTaskRunsWhenTheComputedArrivesLast = async (
    page: Page,
    fixture: Fixture,
    componentFile: string
  ) => {
    const { gate } = await openFixture(page, fixture, 'cold');
    gate.mode = 'pass';
    gate.holdWhilePassing = (url) => chunkHoldsComputedFrom(url, `${TASKS_DIR}${componentFile}`);
    await fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();
    await expect.poll(() => gate.held.length).toBe(1);
    await settle(page, gate);
    await expect(fixtureResult(page, fixture)).not.toHaveAttribute('data-done');
    await releaseAll(gate);
    await expectResult(page, fixture);
    return page.evaluate(() => (globalThis as { taskRuns?: number }).taskRuns);
  };

  test.describe('task reading a computed from context', () => {
    test("a click runs the task once when the computed's chunk arrives last", async ({ page }) => {
      const taskRuns = await countTaskRunsWhenTheComputedArrivesLast(
        page,
        TASK_READING_A_COMPUTED_FROM_CONTEXT,
        'computed-from-context/index.tsx'
      );
      expect(taskRuns).toBe(1);
    });
  });

  test.describe('task reading a computed from props while its parent re-renders', () => {
    test("a click runs the task once when the computed's chunk arrives last", async ({ page }) => {
      const taskRuns = await countTaskRunsWhenTheComputedArrivesLast(
        page,
        TASK_READING_A_COMPUTED_FROM_A_RERENDERING_PARENT,
        'computed-from-rerendering-parent/index.tsx'
      );
      expect(taskRuns).toBe(1);
    });
  });
});

test.describe('user import()', () => {
  test('cold click: 2 round trips, the second fetching only the imported library', async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, USER_IMPORT);
    expect(roundTrips).toHaveLength(2);
    const ownChunks = roundTrips[1].urls.filter((url) => chunkComesFrom(url, USER_IMPORT.sources));
    expect(ownChunks.length).toBeGreaterThan(0);
    expect(ownChunks.every((url) => chunkComesFrom(url, ['src/vendor-lib/']))).toBe(true);
  });
});

test.describe("helper shared from another component's file", () => {
  test("a cold click fetches the helper's module but none of the other component's chunks", async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, SHARED_HELPER);
    const cardChunks = requestedUrls(roundTrips).filter((url) =>
      chunkComesFrom(url, [
        'src/components/fixtures/shared-helper/card.tsx_',
        'src/components/fixtures/shared-helper/sparkline.ts',
      ])
    );
    expect(cardChunks).toEqual([]);
  });
});

test.describe('component re-exported by a barrel file', () => {
  test("a cold click fetches that component but none of the barrel's other components", async ({
    page,
  }) => {
    const roundTrips = await coldClick(page, BARREL);
    const otherComponents = requestedUrls(roundTrips).filter((url) =>
      chunkComesFrom(url, [
        'src/components/fixtures/barrel/ui/beta',
        'src/components/fixtures/barrel/ui/gamma',
      ])
    );
    expect(otherComponents).toEqual([]);
  });
});
