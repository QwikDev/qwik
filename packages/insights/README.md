# Qwik Insights

## Cloudflare deployment

The Qwik monorepo deploys two independent applications in the QwikDev Cloudflare account:

| Application   | Cloudflare project      | Source directory    | Domain              |
| ------------- | ----------------------- | ------------------- | ------------------- |
| Documentation | Pages: `qwik-docs`      | `packages/docs`     | `qwik.dev`          |
| Insights      | Worker: `qwik-insights` | `packages/insights` | `insights.qwik.dev` |

Each application has its own deployment workflow. `deploy-insights.yml` builds and deploys
Insights when its code or shared dependencies change on the production `v1` branch.
The docs deployment remains independent.

The repository secret `CLOUDFLARE_INSIGHTS_API_TOKEN` authenticates Insights deployments.
Use a QwikDev account-owned token with Workers Editor access at the Workers product scope
(or legacy Workers Scripts Edit), plus Workers Routes Write/Edit and Zone Read for `qwik.dev`.
Product-level access is needed because Cloudflare does not yet support per-Worker roles for
Custom Domains. The QwikDev account ID is configured in `wrangler.jsonc`.

The docs workflow uses its own existing `CLOUDFLARE_API_TOKEN`; Pages permissions alone
do not grant access to Workers. Insights checks access to `qwik-insights` before building,
so a missing token or insufficient access fails early. If that check fails, verify the
token's account and Workers permissions, update the repository secret, and rerun the job.

Runtime secrets belong to the Worker, not GitHub or the checked-in configuration:

- `PRIVATE_LIBSQL_DB_API_TOKEN`: Turso database token.
- `PRIVATE_AUTH_SECRET`: Auth.js session encryption secret.
- `PRIVATE_GITHUB_SECRET`: the QwikDev-owned Qwik Insights OAuth application's client secret.

The OAuth application's existing production callback is under
`https://insights.qwik.dev/auth/callback/github`. Do not use production OAuth credentials
with untrusted preview deployments. A `workers.dev` preview can verify rendering and the
OAuth redirect, but completing sign-in requires the registered production callback.

For a clean local deployment, from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build --qwik --qwikcity --qwiklabs --eslint --tsc --platform-binding-wasm-copy --set-dist-tag release
pnpm -C packages/insights build
pnpm -C packages/insights run deploy.dry-run
pnpm -C packages/insights run deploy
```

For local Workers testing, put runtime secrets in the ignored `.dev.vars` file and run
`pnpm -C packages/insights serve.cloudflare`. Never commit that file.

The Workers adapter uses Qwik City's Cloudflare Pages middleware, which requires the
`entry.cloudflare-pages.tsx` filename and the `ASSETS` binding. `.assetsignore` keeps
the Worker entry and Pages control files out of the public static assets.

`insights.qwik.dev` is a Worker Custom Domain. Cloudflare manages its DNS record and TLS.
To roll back hosting, remove that Custom Domain and restore the original proxied CNAME
`insights.qwik.dev` → `insights-qwik.netlify.app` with automatic TTL. Also remove the Custom
Domain from `wrangler.jsonc` before deploying again. The former Netlify deployment requires
separate access to restore its login configuration.

## Local Development

Ensure you have `.env.local` set up like so:

```
PRIVATE_LIBSQL_DB_URL=ws://127.0.0.1:8080
PRIVATE_LIBSQL_DB_API_TOKEN=(none)
PRIVATE_AUTH_BASE_API=/api/auth
```

```sh
npm run db.local
```

in another window

```sh
npm run db.migrate
```

### Local Development with

If you would like to run the application with production database set up `.env.local` like so:

```
PRIVATE_LIBSQL_DB_URL=libsql://qwik-bundalyzer-mhevery.turso.io
PRIVATE_LIBSQL_DB_API_TOKEN=<API_TOKEN>
PRIVATE_AUTH_SECRET=<AUTH_SECRET>
PRIVATE_AUTH_BASE_API=/api/auth
```

You need two pieces of information:

- `AUTH_SECRET`:
  - run `turso auth login` to authenticate
  - run `turso auth api-tokens mint insights-<you-username>` to get a new token
- `API_TOKEN`: This is needed for using github as authentication. See: https://qwik.dev/docs/integrations/authjs/#github
