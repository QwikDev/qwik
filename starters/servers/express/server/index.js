const express = require('express');
const path = require('path');
const qwik = require('@builder.io/qwik/server');
const { join } = require('path');
const { existsSync } = require('fs');

const PORT = process.env.PORT || 8080;

async function startServer() {
  const render = await qwik.createServerRenderer({
    serverDir: path.join(__dirname, 'build'),
    serverMainPath: 'index.server.qwik.js',
    symbolsPath: 'q-symbols.json',
  });

  async function indexHandler(req, res) {
    const result = await render({
      url: req.url,
      debug: true,
    });
    res.send(result.html);
  }

  const app = express();
  const publicDir = join(__dirname, '..', 'public');
  const buildDir = join(__dirname, '..', 'public', 'build');
  app.use(express.static(publicDir));
  app.use(express.static(buildDir));

  // Optionally server Partytown if found.
  const partytownDir = join(__dirname, '..', 'node_modules', '@builder.io', 'partytown', 'lib');
  if (existsSync(partytownDir)) {
    app.use('/~partytown', express.static(partytownDir));
  }

  app.get('/', indexHandler);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`http://localhost:${PORT}/`);
  });
}

startServer();
