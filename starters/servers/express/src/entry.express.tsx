import express from 'express';
import { join } from 'path';
import { render } from './entry.ssr';

/**
 * Create an express server
 * https://expressjs.com/
 */
const app = express();

/**
 * Serve static client build files,
 * hashed filenames, immutable cache-control
 */
app.use(
  '/build',
  express.static(join(__dirname, '..', 'dist', 'build'), {
    immutable: true,
    maxAge: '1y',
  })
);

/**
 * Serve static public files at the root
 */
app.use(express.static(join(__dirname, '..', 'dist'), { index: false }));

/**
 * Server-Side Render Qwik application
 */
app.get('/*', async (req, res, next) => {
  try {
    // Render the Root component to a string
    const result = await render({
      url: req.url,
    });

    // respond with SSR'd HTML
    res.send(result.html);
  } catch (e) {
    // Error while server-side rendering
    next(e);
  }
});

/**
 * Start the express server
 */
app.listen(8080, () => {
  /* eslint-disable */
  console.log(`http://localhost:8080/`);
});
