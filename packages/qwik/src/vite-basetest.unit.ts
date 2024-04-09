// import { beforeAll, test, afterAll, expect } from 'vitest';
// import { loadFixture } from './test-util';
// import { load } from 'cheerio';

// let devServer: any;
// let fixture: any;
// beforeAll(async () => {
//   fixture = await loadFixture({
//     root: '../../../starters/apps/base',
//     base: '/qwikcity-test/',
//   });
//   devServer = await fixture.startDevServer();
// });

// afterAll(async () => {
//   devServer.close();
// });

// test('basic', async () => {
//   const m = await fixture.fetch('/');
//   const html = load(m);
//   expect(1).toBe(1);
// });
