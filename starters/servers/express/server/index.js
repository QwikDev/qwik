const express = require('express');
const { join } = require('path');
const { existsSync } = require('fs');
const { render } = require('./build/entry.js');
const symbols = require('./q-symbols.json');
const PORT = process.env.PORT || 8080;

async function startServer() {
  async function handleQwik(req, res) {
    const result = await render({
      symbols,
      url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
      debug: true,
    });
    res.send(result.html);
  }

  const app = express();
  const publicDir = join(__dirname, '..', 'public');
  app.use(express.static(publicDir));

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
