/* eslint-disable */

import express from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import type { RequestHandler } from 'express';

// @ts-ignore
import { render } from './entry.server';

// @ts-ignore
import symbols from '../server/q-symbols.json';

const PORT = process.env.PORT || 8080;

export const qwikMiddleware: RequestHandler = async (req, res) => {
  const result = await render({
    symbols,
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
    debug: true,
  });
  res.send(result.html);
};

async function startServer() {
  const app = express();
  const publicDir = join(__dirname, '..', 'public');
  app.use(
    express.static(publicDir, {
      index: false,
    })
  );

  // Optionally server Partytown if found.
  const partytownDir = join(
    __dirname,
    '..',
    '..',
    'node_modules',
    '@builder.io',
    'partytown',
    'lib'
  );
  if (existsSync(partytownDir)) {
    app.use('/~partytown', express.static(partytownDir));
  }

  app.get('/*', qwikMiddleware);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`http://localhost:${PORT}/`);
  });
}

startServer();
