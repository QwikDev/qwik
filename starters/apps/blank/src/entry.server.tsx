import polka from 'polka';
import sirv from 'sirv';
import { fileURLToPath } from 'url';
import { join } from 'path';
import render from './entry.ssr';

// Directories where the static assets are located
const distDir = join(fileURLToPath(import.meta.url), '..', '..', 'dist');
const buildDir = join(distDir, 'build');

// Create the http server with polka
// https://github.com/lukeed/polka
const app = polka();

// Static asset middleware with sirv
// https://github.com/lukeed/sirv
app.use(`/build`, sirv(buildDir, { immutable: true }));
app.use(sirv(distDir));

// Handler for all requests
app.get('/*', async (req, res, next) => {
  try {
    // Render the Root component to a string
    const result = await render({
      stream: res,
    });

    // Respond with SSR'd HTML
    if ('html' in result) {
      res.send((result as any).html);
    } else {
      res.end();
    }
  } catch (e) {
    // Error while server-side rendering
    next(e);
  }
});

// start the server
app.listen(3000, () => {
  /* eslint-disable */
  console.log(`http://localhost:3000/`);
});
