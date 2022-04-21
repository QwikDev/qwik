/* eslint-disable */
const express = require('express');
const { join } = require('path');
const { render } = require('./server/entry.server');

const PORT = process.env.PORT || 8080;

async function qwikMiddleware(req, res) {
  const result = await render({
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
  });
  res.send(result.html);
}

async function startServer() {
  const app = express();
  const distDir = join(__dirname, 'dist');

  app.use(
    express.static(distDir, {
      index: false,
    })
  );

  app.get('/*', qwikMiddleware);

  app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}/`);
  });
}

startServer();
