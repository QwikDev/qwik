const express = require('express');
const path = require('path');
const qwik = require('@builder.io/qwik/server');

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
  app.use(express.static(publicDir));
  app.get('/', indexHandler);
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`http://localhost:${PORT}/`);
  });
}

startServer();
