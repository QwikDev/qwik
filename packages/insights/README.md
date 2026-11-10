# Qwik Insights

Insights uses this repository's Qwik v2 core and router through `workspace:*` dependencies.
Build the workspace packages before building or running the dashboard. Keep the
`@builder.io/qwik` / `@builder.io/qwik-city` overrides and the Vite `noExternal` configuration:
Auth.js and Modular Forms still import those names and must resolve to the same v2 runtime.

## Local development

Use the Node.js and pnpm versions required by the repository's root `package.json`. From the
repository root:

```sh
pnpm install --frozen-lockfile
pnpm build.core.dev
pnpm build.eslint
```

Create `packages/insights/.env.local`:

```dotenv
PRIVATE_LIBSQL_DB_URL=ws://127.0.0.1:8080
PRIVATE_LIBSQL_DB_API_TOKEN=(none)
PRIVATE_AUTH_SECRET=<random-session-secret>
PRIVATE_GITHUB_ID=<github-oauth-client-id>
PRIVATE_GITHUB_SECRET=<github-oauth-client-secret>
```

Generate `PRIVATE_AUTH_SECRET` with `openssl rand -base64 32`. The libSQL token authenticates
database requests; it is separate from the session secret and GitHub OAuth credentials.

Create a GitHub OAuth application with callback URL
`http://localhost:5173/auth/callback/github`. The installed `@auth/qwik` adapter uses `/auth`
and overrides a custom `basePath`; `PRIVATE_AUTH_BASE_API` is not used. See the
[Auth.js integration guide](https://qwik.dev/docs/integrations/authjs/).

With the Turso CLI installed, start a local database in one terminal:

```sh
pnpm -C packages/insights db.local
```

In another terminal, apply the schema and start the dashboard:

```sh
pnpm -C packages/insights db.migrate
pnpm -C packages/insights dev
```

For a hosted database, set `PRIVATE_LIBSQL_DB_URL` to its libSQL URL and
`PRIVATE_LIBSQL_DB_API_TOKEN` to a token for that database.

## Verify the upgrade

Run from the repository root after building the workspace packages:

```sh
pnpm exec vitest run packages/insights
PUBLIC_QWIK_INSIGHTS_KEY='' pnpm build.packages.insights
```

The dashboard build runs type checking, lint, and the client and Netlify Edge builds. Clearing
`PUBLIC_QWIK_INSIGHTS_KEY` disables the Insights build plugin's remote requests during local
verification. Production builds should use the intended application's public key.

Check the generated client manifest against the ingestion schema:

```sh
node --input-type=module -e 'import { readFileSync } from "node:fs"; import { QManifest } from "./packages/insights/src/types/q-manifest.ts"; QManifest.parse(JSON.parse(readFileSync("packages/insights/dist/q-manifest.json", "utf8")));'
```

Qwik v2 manifests can omit `platform.qwik`. Insights accepts that omission while retaining
validation of supplied version metadata and the symbol records used for database writes.

## Staging and production

Build production workspace artifacts with `pnpm build.core` and `pnpm build.eslint`, then
run `pnpm build.packages.insights`. The app produces static assets in
`packages/insights/dist` and edge functions in `packages/insights/.netlify/edge-functions`.
Netlify must resolve both directories relative to the app's configured base directory.
The repository CI builds these artifacts; confirm the Netlify site's source branch, commit,
build command, and publish directory before promoting a deployment.

Before promotion:

- Configure the database, session, and GitHub credentials for the target environment. Register
  `https://<deployment-host>/auth/callback/github` as its GitHub OAuth callback.
- Check the target database's migration history against `drizzle/` and apply any outstanding
  migrations separately. The manifest compatibility change does not require a schema migration.
- Verify sign-in, sign-out, unauthenticated redirects, and per-application access restrictions.
- Exercise application creation and editing, user access changes, dashboard navigation, and
  symbol details in a browser.
- Send manifests, symbol events, and error events from both Qwik v1 and v2 fixture applications
  to a registered staging application. Confirm ingestion, dashboard results, and bundle strategy
  responses, including cross-origin browser requests.
- Confirm the rendered page reports the expected `q:version`. Retain the previous Netlify deploy
  for rollback and verify database compatibility before rolling back application code.
