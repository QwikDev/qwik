/* eslint-disable */

const express = require('express');
const { join } = require('path');

const app = express();

// static build files, hashed filenames, immutable cache-control
app.use(
  '/build',
  express.static(join(__dirname, 'dist', 'build'), {
    immutable: true,
    maxAge: '1y',
  })
);

// static root files
app.use(express.static(join(__dirname, 'dist'), { index: false }));

// server-side renders Qwik application
const { qwikMiddleware } = require('./server/entry.server');
app.get('/*', qwikMiddleware);

app.listen(8080, () => console.log(`http://localhost:8080/`));
