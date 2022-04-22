/* eslint-disable */

const express = require('express');
const { join } = require('path');

const app = express();

// serves static files from the dist directory
app.use(
  express.static(join(__dirname, 'dist'), {
    index: false,
  })
);

// server-side renders Qwik application
const { qwikMiddleware } = require('./server/entry.server');
app.get('/*', qwikMiddleware);

app.listen(8080, () => console.log(`http://localhost:8080/`));
