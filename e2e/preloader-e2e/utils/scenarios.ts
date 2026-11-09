import { expect, type Page, type Route } from '@playwright/test';
import type { Fixture } from './fixtures';
import {
  countRoundTrips,
  createGate,
  openCold,
  openWarm,
  recordSpeculativePreloads,
  releaseAll,
  resultIsDone,
  type Gate,
} from './gate';

export type OpenFixture = {
  page: Page;
  fixture: Fixture;
  gate: Gate;
  ongoing: Route[];
};

export const fixtureRoot = (page: Page, fixture: Fixture) =>
  page.locator(`[data-fixture="${fixture.id}"]`);

export const fixtureResult = (page: Page, fixture: Fixture) =>
  fixtureRoot(page, fixture).locator('[data-testid=result]');

export const expectResult = async (page: Page, fixture: Fixture) => {
  const result = fixtureResult(page, fixture).filter({ visible: true });
  await expect(result).toHaveAttribute('data-done');
  if (fixture.expected) {
    await expect(result).toHaveText(fixture.expected);
  }
};

export const openFixture = async (
  page: Page,
  fixture: Fixture,
  state: 'cold' | 'warm'
): Promise<OpenFixture> => {
  await recordSpeculativePreloads(page);
  const gate = await createGate(page);
  const ongoing =
    state === 'cold'
      ? await openCold(page, gate, fixture)
      : (await openWarm(page, gate, fixture.path), []);
  return { page, fixture, gate, ongoing };
};

export const countFixtureRoundTrips = (
  { page, fixture, gate, ongoing }: OpenFixture,
  action: () => Promise<unknown>,
  isDone: () => Promise<boolean>
) => countRoundTrips(page, gate, action, isDone, ongoing, { ownSources: fixture.sources });

export const clickTrigger = (opened: OpenFixture) =>
  countFixtureRoundTrips(
    opened,
    () => fixtureRoot(opened.page, opened.fixture).locator('[data-testid=trigger]').click(),
    resultIsDone(fixtureResult(opened.page, opened.fixture))
  );

const clickOnce = async (page: Page, fixture: Fixture, state: 'cold' | 'warm') => {
  const opened = await openFixture(page, fixture, state);
  const roundTrips = await clickTrigger(opened);
  await releaseAll(opened.gate, opened.ongoing);
  await expectResult(page, fixture);
  return roundTrips;
};

export const coldClick = (page: Page, fixture: Fixture) => clickOnce(page, fixture, 'cold');

export const warmClick = (page: Page, fixture: Fixture) => clickOnce(page, fixture, 'warm');
