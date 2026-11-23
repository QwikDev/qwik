import { expect, test, type Page } from '@playwright/test';
import { defineColdClickTest } from '../utils/click-tests';
import {
  chunkComesFrom,
  chunkHasComponent,
  chunkHasScopedStyles,
  chunkHoldsComputedFrom,
  chunkHoldsTaskFrom,
  ORIGIN,
} from '../utils/app';
import {
  BARREL,
  CALLBACK_READING_A_COMPUTED,
  MATRIX,
  MODAL,
  NEVER_SHOWS_RESULT,
  QRL_PROP,
  SCOPED_STYLES,
  SHARED_HELPER,
  SLOT,
  SYNC,
  TASK_READING_A_COMPUTED_FROM_ITS_PARENT,
  TASKS_IN_PARENT_AND_CHILD,
  TASKS_IN_SIBLINGS,
  TASKS_ON_A_SHARED_STORE,
  USER_IMPORT,
} from '../utils/fixtures';
import {
  chunksHintedAtHighestPriority,
  recordPreloadHints,
  releaseAll,
  resultIsDone,
  settle,
  type RoundTrip,
} from '../utils/gate';
import {
  coldClick,
  countFixtureRoundTrips,
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

  test('opening the page asks for no task chunk at the highest priority', async ({ page }) => {
    await recordPreloadHints(page);
    await openFixture(page, TASKS_IN_PARENT_AND_CHILD, 'cold');
    const taskChunks = (await chunksHintedAtHighestPriority(page)).filter((chunk) =>
      ['parent-child/index.tsx', 'parent-child/child.tsx'].some((file) =>
        chunkHoldsTaskFrom(`${ORIGIN}/build/${chunk}`, `${TASKS_DIR}${file}`)
      )
    );
    expect(taskChunks).toEqual([]);
  });

  test.describe('task reading a computed from another component', () => {
    const fixture = TASK_READING_A_COMPUTED_FROM_ITS_PARENT;
    const holdsTheComputed = (url: string) =>
      chunkHoldsComputedFrom(url, `${TASKS_DIR}computed-from-parent/index.tsx`);

    const clickWhileTheComputedLoads = async (page: Page, buttonTestId: string) => {
      const { gate } = await openFixture(page, fixture, 'cold');
      gate.mode = 'pass';
      gate.holdWhilePassing = holdsTheComputed;
      await fixtureRoot(page, fixture).locator(`[data-testid=${buttonTestId}]`).click();
      await expect.poll(() => gate.held.length).toBe(1);
      return gate;
    };

    test("a click runs the task once when the computed's chunk arrives last", async ({ page }) => {
      const gate = await clickWhileTheComputedLoads(page, 'trigger');
      await settle(page, gate);
      await expect(fixtureResult(page, fixture)).not.toHaveAttribute('data-done');
      await releaseAll(gate);
      await expectResult(page, fixture);
      expect(await page.evaluate(() => (globalThis as { taskRuns?: number }).taskRuns)).toBe(1);
    });

    test("a click that only reads a signal shows its result while the task's computed is still loading", async ({
      page,
    }) => {
      const gate = await clickWhileTheComputedLoads(page, 'read');
      await expect(fixtureRoot(page, fixture).locator('[data-testid=read-result]')).toHaveAttribute(
        'data-done'
      );
      expect(gate.held).toHaveLength(1);
      await releaseAll(gate);
    });
  });

  test.describe('callback reading a computed that a task in the chain also reads', () => {
    test("a click whose callback reads the task's computed shows its value when the computed's chunk arrives last", async ({
      page,
    }) => {
      test.fail(
        true,
        "the task's early restore starts the computed's load, so the callback no longer waits for it (#9586)"
      );
      const fixture = CALLBACK_READING_A_COMPUTED;
      const { gate } = await openFixture(page, fixture, 'cold');
      gate.mode = 'pass';
      gate.holdWhilePassing = (url) =>
        chunkHoldsComputedFrom(url, `${TASKS_DIR}callback-reading-a-computed/index.tsx`);
      await fixtureRoot(page, fixture).locator('[data-testid=trigger]').click();
      await expect.poll(() => gate.held.length).toBe(1);
      await settle(page, gate);
      await releaseAll(gate);
      await expectResult(page, fixture);
      expect(await page.evaluate(() => (globalThis as { handlerRuns?: number }).handlerRuns)).toBe(
        1
      );
    });
  });
});

test.describe('tasks on a shared store', () => {
  const SHARED_STORE_DIR = `${TASKS_DIR}shared-store/`;
  const holdsTheTaskOnA = (url: string) =>
    chunkHoldsTaskFrom(url, `${SHARED_STORE_DIR}tracks-a.tsx`);
  const holdsTheTaskOnB = (url: string) =>
    chunkHoldsTaskFrom(url, `${SHARED_STORE_DIR}tracks-b.tsx`);
  const holdsTheWriteHandler = (url: string) =>
    chunkComesFrom(url, [`${SHARED_STORE_DIR}writer.tsx_`]);

  const coldClickOn = async (page: Page, buttonTestId: string, resultTestId: string) => {
    const opened = await openFixture(page, TASKS_ON_A_SHARED_STORE, 'cold');
    const root = fixtureRoot(page, TASKS_ON_A_SHARED_STORE);
    const roundTrips = await countFixtureRoundTrips(
      opened,
      () => root.locator(`[data-testid=${buttonTestId}]`).click(),
      resultIsDone(root.locator(`[data-testid=${resultTestId}]`))
    );
    const stillOngoing = opened.gate.held.map((route) => route.request().url());
    await releaseAll(opened.gate);
    return { roundTrips, fetched: [...requestedUrls(roundTrips), ...stillOngoing] };
  };

  test("a click that changes one property fetches the task that tracks it with the click's handler", async ({
    page,
  }) => {
    const { roundTrips } = await coldClickOn(page, 'trigger', 'result');
    const handlerRoundTrip = roundTripOf(roundTrips, holdsTheWriteHandler);
    expect(handlerRoundTrip).toBeGreaterThanOrEqual(0);
    expect(roundTripOf(roundTrips, holdsTheTaskOnA)).toBe(handlerRoundTrip);
  });

  test('a click that changes one property fetches no chunk of the tasks that track its other properties', async ({
    page,
  }) => {
    const { fetched } = await coldClickOn(page, 'trigger', 'result');
    test.fail(
      true,
      "on main, core can't tell which property the click changes, so every task on the store gets its chunk fetched"
    );
    expect(fetched.filter(holdsTheTaskOnB)).toEqual([]);
  });

  test('a click that reads the store without changing it fetches no task chunk', async ({
    page,
  }) => {
    const { fetched } = await coldClickOn(page, 'read', 'read-result');
    test.fail(
      true,
      "on main, core can't tell a read from a write, so every task on the store gets its chunk fetched"
    );
    expect(fetched.filter((url) => holdsTheTaskOnA(url) || holdsTheTaskOnB(url))).toEqual([]);
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
