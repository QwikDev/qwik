import { Project } from 'ts-morph';
import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings } from '../report';
import { removeQwikCityPlan, replaceNotFound } from './entries';
import type { Codemod } from './run-codemods';

const run = (codemod: Codemod, code: string) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('entry.tsx', code);
  const changed = codemod(file);
  return { changed, text: file.getFullText() };
};

describe('removeQwikCityPlan', () => {
  test('removes the option and the unused import', () => {
    const { changed, text } = run(
      removeQwikCityPlan,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';`,
        `import qwikCityPlan from '@qwik-city-plan';`,
        `import render from './entry.ssr';`,
        `export default createQwikCity({ render, qwikCityPlan });`,
      ].join('\n')
    );
    expect(changed).toBe(true);
    expect(text).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/azure-swa';`,
        `import render from './entry.ssr';`,
        `export default createQwikCity({ render });`,
      ].join('\n')
    );
  });

  test('removes a non-shorthand option and keeps an import that is still used', () => {
    const { text } = run(
      removeQwikCityPlan,
      [
        `import { createQwikCity as create } from '@builder.io/qwik-city/middleware/node';`,
        `import plan from '@qwik-city-plan';`,
        `console.log(plan.routes);`,
        `const { router } = create({`,
        `  render,`,
        `  qwikCityPlan: plan,`,
        `  static: {},`,
        `});`,
      ].join('\n')
    );
    expect(text).toBe(
      [
        `import { createQwikCity as create } from '@builder.io/qwik-city/middleware/node';`,
        `import plan from '@qwik-city-plan';`,
        `console.log(plan.routes);`,
        `const { router } = create({`,
        `  render,`,
        `  static: {},`,
        `});`,
      ].join('\n')
    );
  });

  test('ignores functions not imported from qwik-city middleware', () => {
    const code = `import { createQwikCity } from './mine';\ncreateQwikCity({ qwikCityPlan });`;
    expect(run(removeQwikCityPlan, code)).toEqual({ changed: false, text: code });
  });
});

describe('replaceNotFound', () => {
  afterEach(() => takeWarnings());

  test('node: answers with a 404 when the router falls through', () => {
    const { text } = run(
      replaceNotFound,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router, notFound, staticFile } = createQwikCity({ render });`,
        `server.on('request', (req, res) => {`,
        `  staticFile(req, res, () => {`,
        `    router(req, res, () => {`,
        `      notFound(req, res, () => {});`,
        `    });`,
        `  });`,
        `});`,
      ].join('\n')
    );
    expect(text).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router, staticFile } = createQwikCity({ render });`,
        `server.on('request', (req, res) => {`,
        `  staticFile(req, res, () => {`,
        `    router(req, res, () => {`,
        `      (res.headersSent || res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('Not Found'));`,
        `    });`,
        `  });`,
        `});`,
      ].join('\n')
    );
  });

  test('bun/deno: returns a 404 response', () => {
    const { text } = run(
      replaceNotFound,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/bun';`,
        `const { router, notFound, staticFile } = createQwikCity({ render });`,
        `async function fetch(request: Request) {`,
        `  return notFound(request);`,
        `}`,
      ].join('\n')
    );
    expect(text).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/bun';`,
        `const { router, staticFile } = createQwikCity({ render });`,
        `async function fetch(request: Request) {`,
        `  return new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });`,
        `}`,
      ].join('\n')
    );
  });

  test('express: replaces the middleware reference', () => {
    const { text } = run(
      replaceNotFound,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router, notFound } = createQwikCity({ render });`,
        `app.use(router);`,
        `app.use(notFound);`,
      ].join('\n')
    );
    expect(text).toBe(
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router } = createQwikCity({ render });`,
        `app.use(router);`,
        `app.use((_req, res) => res.headersSent || res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('Not Found'));`,
      ].join('\n')
    );
  });

  test('fastify: handles await and member expressions', () => {
    const { text } = run(
      replaceNotFound,
      [
        `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
        `const { router, notFound } = createQwikCity({ render, qwikCityPlan });`,
        `fastify.setNotFoundHandler(async (request, response) => {`,
        `  await notFound(request.raw, response.raw, (err) => fastify.log.error(err));`,
        `});`,
      ].join('\n')
    );
    expect(text).toContain(
      `  await (response.raw.headersSent || response.raw.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end('Not Found'));`
    );
    expect(text).toContain(`const { router } = createQwikCity`);
  });

  test('warns and keeps unknown usages', () => {
    const code = [
      `import { createQwikCity } from '@builder.io/qwik-city/middleware/node';`,
      `const { notFound } = createQwikCity({ render });`,
      `export { notFound };`,
    ].join('\n');
    expect(run(replaceNotFound, code)).toEqual({ changed: false, text: code });
    expect(takeWarnings()).toEqual([
      '/entry.tsx: `notFound` was removed in v2, the router renders 404 pages.',
    ]);
  });
});
