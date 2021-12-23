const express = require('express');
const { join } = require('path');
const { existsSync } = require('fs');
const { renderApp } = require('./build/index.server.js');
const symbols = require('./build/q-symbols.json');
const PORT = process.env.PORT || 8080;

async function startServer() {
  async function handleQwik(req, res) {
    const result = await renderApp({
      symbols,
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

  app.get('/', handleQwik);

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`http://localhost:${PORT}/`);
  });
}

startServer();
