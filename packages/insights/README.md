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

### Local identity override

For local inspection without GitHub OAuth, set `PRIVATE_DEV_USER_EMAIL` in `.env.local` to your
existing Insights database user email. The override runs only in development on `localhost`,
`127.0.0.1`, or `[::1]`. Keep the dev server bound to loopback. Application access still comes from
that user's database permissions; the override does not grant access or create a database user.
Use a read-only database token when inspecting production telemetry. Remove the variable to return
to GitHub sign-in. Production builds ignore it.

## Verify the upgrade

Run from the repository root after building the workspace packages:

```sh
pnpm exec vitest run packages/insights
PUBLIC_QWIK_INSIGHTS_KEY='' pnpm build.packages.insights
```

The dashboard build runs type checking, lint, and the client and Cloudflare Workers builds. Clearing
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
`packages/insights/dist` and server modules in `packages/insights/server`.
`wrangler.jsonc` targets the existing `qwik-insights` Worker and its `insights.qwik.dev`
Custom Domain. The Cloudflare adapter uses the Pages middleware and entry filename for Workers;
keep the `ASSETS` binding and both output directories together. `.assetsignore` excludes the
Worker entry and Pages control files from public static assets.

Verify the deployment bundle without publishing:

```sh
pnpm -C packages/insights deploy.dry-run
```

The separate `Deploy Insights` workflow in `.github/workflows/deploy-insights.yml` owns
all deployment preparation and publishing. After `Qwik CI` succeeds on `main`, it checks
out that tested commit, installs locked dependencies, builds Qwik core, the router, the
ESLint plugin, and Insights, then validates the Cloudflare bundle with a dry run. It tests
the migration runner, applies pending database migrations, publishes to Cloudflare, and
checks that production serves Qwik v2 afterward. A failed migration fails the job and
prevents publishing. Look for `Deploy Insights` in the Actions sidebar after `Qwik CI` completes.

Only successful push or manual `Qwik CI` runs on `main` can trigger publishing. Older commits
are skipped if `main` has advanced when deployment starts. To retry, rerun the matching
`Deploy Insights` run; it must still match the current `main` commit. The deployment workflow
builds its own bundle and does not depend on artifacts or preparation jobs in `ci.yml`.

Remove `.github/workflows/deploy-insights.yml` from `v1` before the first v2 deployment;
the new workflow refuses to publish while that competing workflow exists. Both publishers
use the same concurrency group so an in-flight deployment finishes before another starts.
The repository secrets `CLOUDFLARE_INSIGHTS_API_TOKEN` and `INSIGHTS_LIBSQL_MIGRATION_TOKEN`
are required by the credential preflight. After that check, each is exposed only to its
publishing or migration step. Pull requests never run the deployment job.

`INSIGHTS_LIBSQL_MIGRATION_TOKEN` must be a dedicated read/write token scoped to the Insights
database, with schema-change permission. Store it as a GitHub Actions repository secret;
do not use an organization-wide or database-group token. Production migrations read the
URL from `wrangler.jsonc`, so they target the same database as the Worker. They ignore local
`.env` files and require an explicit token. No database credentials enter build artifacts.

The database migration journal makes reruns skip applied migrations. Migrations and publishing
share the existing production concurrency lock. Keep schema changes backward compatible with
the currently deployed Worker: migrations run before publishing, and a later publishing failure
leaves the migrated database in place. Do not roll back the database automatically; retry the
deployment or ship a forward migration. Validate new migrations against staging first.

Keep `PRIVATE_LIBSQL_DB_API_TOKEN`, `PRIVATE_AUTH_SECRET`, and `PRIVATE_GITHUB_SECRET` in
Cloudflare Worker secrets. For local Workers testing, put the local development values from
`.env.local` in the ignored `.dev.vars` file and run
`pnpm -C packages/insights serve.cloudflare` after building. Use separate credentials for
staging and register its GitHub OAuth callback.

Before promotion:

- Configure the database, session, and GitHub credentials for the target environment. Register
  `https://<deployment-host>/auth/callback/github` as its GitHub OAuth callback.
- Check the target database's migration history against `drizzle/`. The production deployment
  applies pending migrations automatically; use `pnpm -C packages/insights db.migrate` for
  local or staging credentials.
- Verify sign-in, sign-out, unauthenticated redirects, and per-application access restrictions.
- Exercise application creation and editing, user access changes, dashboard navigation, and
  symbol details in a browser.
- Send manifests, symbol events, and error events from both Qwik v1 and v2 fixture applications
  to a registered staging application. Confirm ingestion, dashboard results, and bundle strategy
  responses, including cross-origin browser requests.
- Confirm the rendered page reports the expected `q:version`. Retain the previous Worker version
  for rollback and verify database compatibility before rolling back application code.

## GitHub source previews

Application settings → GitHub source code connects each application to a **public** GitHub
repository. Set the repository URL, branch/tag/commit, and repository-relative source directory.
For example, `https://github.com/QwikDev/qwik`, `v1`, and `packages/docs/src` can resolve legacy
DocSearch origins. Use the revision matching the recorded build; pin a commit for stable results.
Older manifests may require a different revision. No GitHub credentials are stored or sent.

The source directory is prepended to each symbol's origin. Leave it empty when origins already
include the full repository-relative path. Clearing the repository disables previews.

The deployment workflow applies `0020_application_source.sql` before publishing this feature.
It adds `application_sources` and preserves the existing Qwik Docs mapping to `main`; it does
not guess a revision for historical builds. No existing analytics rows are modified.
