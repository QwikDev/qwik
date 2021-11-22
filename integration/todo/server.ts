/* eslint no-console: ["off"] */
import type { Request, Response } from 'express';
import express from 'express';
import { join } from 'path';
import srcMap from 'source-map-support';
import { createServerRenderer } from '@builder.io/qwik/server';

const PORT = process.env.PORT || 8080;

async function startServer() {
  const render = await createServerRenderer({
    serverDir: join(__dirname, 'output', 'cjs'),
    clientDir: join(__dirname, 'output', 'esm'),
    serverRenderPath: 'index.server.qwik.js',
  });

  async function indexHandler(req: Request, res: Response) {
    const result = await render({
      url: req.url,
      debug: true,
    });
    res.send(result.html);
  }

  const app = express();
  app.use(express.static('public'));
  app.use(
    express.static('output/esm', {
      immutable: true,
      maxAge: '1y',
    })
  );
  app.get('/', indexHandler);
  app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}/`);
  });
}

srcMap.install();

startServer();
