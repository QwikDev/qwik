---
'@builder.io/qwik-city': patch
---

fix: SPA routing is broken unless origin matches value in in vite.config #8093

If the SSG origin was set to `localhost:3000` and a user visited from `127.0.0.1:3000`, SPA routing would be broken.

Internally, useNavigate's context provider `goto` checks the new destination with the last route location. If the
origin is different, it just does a normal browser navigation. This makes sense; links to other origins cannot use
SPA routing. However, the initial route it compares was using an origin that came from the server environment.

Now, the first navigation will set that initial route to the browser's actual href, eliminating the erroneous
origin mismatch for SPA navigations.
