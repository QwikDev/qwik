# Project Structure

Qwik Router is an opinionated router for Qwik. It dictates a folder structure for routing and provides a Vite plugin for building the router as well as adapters for different platforms (e.g. Cloudflare Pages, Node.js, etc.).

- `adapters/`: Vite plugins for the different platforms
- `buildtime/`: Build-time code for the router: Vite plugin, markdown loader, file-based router config loader, etc
- `middleware/`: SSR middleware for the different platforms
- `runtime/`: Runtime code for the router: SPA functionality, server actions, etc
- `static/`: Static Site Generation tooling
- `utils/`: Shared utility functions
