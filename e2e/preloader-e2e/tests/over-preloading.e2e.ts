import { expect, test, type Page } from '@playwright/test';
import { chunkHasComponent } from '../utils/app';
import {
  CLICK_RUNS_COMPUTED,
  CLICK_RUNS_TASK,
  VISIBLE_TASK_RUNS_COMPUTED,
  VISIBLE_TASK_RUNS_TASK,
  type Fixture,
} from '../utils/fixtures';
import { releaseAll } from '../utils/gate';
import { coldClick, expectResult, openFixture } from '../utils/scenarios';

const TASK_SHIPS_WITH_ITS_COMPONENT =
  "on main, a task's segment is bundled in its component's chunk, so running the task fetches the component and every chunk it reaches";

const componentChunksFetchedByClick = async (page: Page, fixture: Fixture) => {
  const roundTrips = await coldClick(page, fixture);
  return roundTrips.flatMap((roundTrip) => roundTrip.urls).filter(chunkHasComponent);
};

const componentChunksFetchedAtPageLoad = async (page: Page, fixture: Fixture) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const { gate } = await openFixture(page, fixture, 'cold');
  await expectResult(page, fixture);
  const componentChunks = requests.filter(chunkHasComponent);
  await releaseAll(gate);
  return componentChunks;
};

test.describe('over-preloading', () => {
  test.describe('cold click on a handler', () => {
    test('triggers its computed QRL without pulling in the component QRL and all its transitive dependencies', async ({
      page,
    }) => {
      expect(await componentChunksFetchedByClick(page, CLICK_RUNS_COMPUTED)).toEqual([]);
    });

    test('triggers its task QRL without pulling in the component QRL and all its transitive dependencies', async ({
      page,
    }) => {
      const componentChunks = await componentChunksFetchedByClick(page, CLICK_RUNS_TASK);
      test.fail(true, TASK_SHIPS_WITH_ITS_COMPONENT);
      expect(componentChunks).toEqual([]);
    });
  });

  test.describe('visible task at page load', () => {
    test('triggers a computed QRL without pulling in the component QRL and all its transitive dependencies', async ({
      page,
    }) => {
      expect(await componentChunksFetchedAtPageLoad(page, VISIBLE_TASK_RUNS_COMPUTED)).toEqual([]);
    });

    test('triggers a task QRL without pulling in the component QRL and all its transitive dependencies', async ({
      page,
    }) => {
      const componentChunks = await componentChunksFetchedAtPageLoad(page, VISIBLE_TASK_RUNS_TASK);
      test.fail(true, TASK_SHIPS_WITH_ITS_COMPONENT);
      expect(componentChunks).toEqual([]);
    });
  });
});
